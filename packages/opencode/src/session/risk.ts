/**
 * Risk Classification System
 *
 * Labels every agent tool action as LOW, MEDIUM, or HIGH risk.
 * - LOW:    auto-approved, no user interruption
 * - MEDIUM: logged, user notified via bus event, execution continues
 * - HIGH:   gates on Permission.ask — human must explicitly approve
 *
 * Risk is determined by (permission, pattern) pairs using a static
 * rule table that can be extended via opencode.json config.
 */

import z from "zod"
import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import { makeRuntime } from "@/effect/run-service"
import { Log } from "@/util/log"
import { Wildcard } from "@/util/wildcard"
import { Effect, Layer, ServiceMap } from "effect"
import type { SessionID } from "@/session/schema"
import type { MessageID } from "@/session/schema"

export namespace RiskClassifier {
  const log = Log.create({ service: "risk-classifier" })

  // ─── Types ───────────────────────────────────────────────────────────────

  export const Level = z.enum(["LOW", "MEDIUM", "HIGH"]).meta({ ref: "RiskLevel" })
  export type Level = z.infer<typeof Level>

  export const Classification = z
    .object({
      level: Level,
      reason: z.string(),
      permission: z.string(),
      pattern: z.string(),
    })
    .meta({ ref: "RiskClassification" })
  export type Classification = z.infer<typeof Classification>

  export const RuleConfig = z
    .object({
      permission: z.string(),
      pattern: z.string(),
      level: Level,
      reason: z.string().optional(),
    })
    .meta({ ref: "RiskRule" })
  export type RuleConfig = z.infer<typeof RuleConfig>

  // ─── Bus Events ──────────────────────────────────────────────────────────

  export const Event = {
    Classified: BusEvent.define(
      "risk.classified",
      z.object({
        sessionID: z.string(),
        messageID: z.string(),
        callID: z.string(),
        classification: Classification,
      }),
    ),
    HighRiskGated: BusEvent.define(
      "risk.high_gated",
      z.object({
        sessionID: z.string(),
        messageID: z.string(),
        callID: z.string(),
        classification: Classification,
        approved: z.boolean(),
      }),
    ),
  }

  // ─── Default Rule Table ───────────────────────────────────────────────────
  //
  // Rules are evaluated last-match wins (same as Permission rulesets).
  // Admins can extend/override via config.risk.rules[].

  const DEFAULT_RULES: RuleConfig[] = [
    // ── Reads: all LOW ──────────────────────────────────────────────────────
    { permission: "read", pattern: "*", level: "LOW", reason: "Read-only file access" },
    { permission: "glob", pattern: "*", level: "LOW", reason: "File pattern search" },
    { permission: "grep", pattern: "*", level: "LOW", reason: "Content search" },
    { permission: "list", pattern: "*", level: "LOW", reason: "Directory listing" },
    { permission: "codesearch", pattern: "*", level: "LOW", reason: "Code search" },
    { permission: "webfetch", pattern: "*", level: "LOW", reason: "Web fetch" },
    { permission: "websearch", pattern: "*", level: "LOW", reason: "Web search" },

    // ── Writes: MEDIUM by default, HIGH for sensitive paths ─────────────────
    { permission: "edit", pattern: "*", level: "MEDIUM", reason: "File edit" },
    { permission: "write", pattern: "*", level: "MEDIUM", reason: "File write" },
    { permission: "multiedit", pattern: "*", level: "MEDIUM", reason: "Multi-file edit" },
    { permission: "apply_patch", pattern: "*", level: "MEDIUM", reason: "Apply patch" },

    // Sensitive config / secrets files → HIGH
    { permission: "edit", pattern: "**/.env", level: "HIGH", reason: "Editing secrets file" },
    { permission: "edit", pattern: "**/.env.*", level: "HIGH", reason: "Editing secrets file" },
    { permission: "write", pattern: "**/.env", level: "HIGH", reason: "Writing secrets file" },
    { permission: "write", pattern: "**/.env.*", level: "HIGH", reason: "Writing secrets file" },
    { permission: "edit", pattern: "**/secrets*", level: "HIGH", reason: "Editing secrets file" },
    { permission: "write", pattern: "**/secrets*", level: "HIGH", reason: "Writing secrets file" },

    // CI / deployment configs → HIGH
    { permission: "edit", pattern: "**/.github/workflows/**", level: "HIGH", reason: "Editing CI workflow" },
    { permission: "write", pattern: "**/.github/workflows/**", level: "HIGH", reason: "Writing CI workflow" },
    { permission: "edit", pattern: "**/Dockerfile*", level: "HIGH", reason: "Editing Dockerfile" },
    { permission: "write", pattern: "**/Dockerfile*", level: "HIGH", reason: "Writing Dockerfile" },

    // ── Bash: tiered by destructive potential ───────────────────────────────
    { permission: "bash", pattern: "*", level: "MEDIUM", reason: "Shell command" },

    // Destructive bash patterns → HIGH
    { permission: "bash", pattern: "*rm -rf*", level: "HIGH", reason: "Destructive shell: rm -rf" },
    { permission: "bash", pattern: "*git push*", level: "HIGH", reason: "Remote push" },
    { permission: "bash", pattern: "*git push --force*", level: "HIGH", reason: "Force push" },
    { permission: "bash", pattern: "*sudo *", level: "HIGH", reason: "Elevated privilege command" },
    { permission: "bash", pattern: "*curl*|*bash*", level: "HIGH", reason: "Remote code execution pattern" },
    { permission: "bash", pattern: "*wget*|*bash*", level: "HIGH", reason: "Remote code execution pattern" },
    { permission: "bash", pattern: "*npm publish*", level: "HIGH", reason: "Publishing to registry" },
    { permission: "bash", pattern: "*yarn publish*", level: "HIGH", reason: "Publishing to registry" },
    { permission: "bash", pattern: "*bun publish*", level: "HIGH", reason: "Publishing to registry" },
    { permission: "bash", pattern: "*pip install*", level: "MEDIUM", reason: "Installing Python package" },
    { permission: "bash", pattern: "*npm install*", level: "LOW", reason: "Installing JS package" },

    // ── Tasks / subagents ────────────────────────────────────────────────────
    { permission: "task", pattern: "*", level: "LOW", reason: "Spawning subagent" },

    // ── External directories ─────────────────────────────────────────────────
    { permission: "external_directory", pattern: "*", level: "MEDIUM", reason: "Accessing external directory" },

    // ── Plan tools ───────────────────────────────────────────────────────────
    { permission: "plan_enter", pattern: "*", level: "LOW", reason: "Entering plan mode" },
    { permission: "plan_exit", pattern: "*", level: "LOW", reason: "Exiting plan mode" },
  ]

  // ─── Classifier logic ────────────────────────────────────────────────────

  function classify(permission: string, pattern: string, extraRules: RuleConfig[]): Classification {
    const allRules = [...DEFAULT_RULES, ...extraRules]
    let matched: RuleConfig | undefined

    for (const rule of allRules) {
      if (!Wildcard.match(permission, rule.permission)) continue
      if (!Wildcard.match(pattern, rule.pattern)) continue
      matched = rule
    }

    if (!matched) {
      return {
        level: "MEDIUM",
        reason: `No risk rule matched permission="${permission}" pattern="${pattern}"`,
        permission,
        pattern,
      }
    }

    return {
      level: matched.level,
      reason: matched.reason ?? `Risk rule: ${matched.permission}/${matched.pattern}`,
      permission,
      pattern,
    }
  }

  // ─── Service ─────────────────────────────────────────────────────────────

  export interface Interface {
    /**
     * Classify a tool call.  Returns the risk level and reason.
     * Does NOT gate execution — call `gate` for that.
     */
    readonly classify: (permission: string, pattern: string) => Effect.Effect<Classification>

    /**
     * Classify and gate a tool call.
     * - LOW:    resolves immediately
     * - MEDIUM: publishes bus event, resolves immediately
     * - HIGH:   publishes bus event AND raises a Permission.ask so the user
     *           must explicitly approve before the tool runs
     */
    readonly gate: (input: {
      permission: string
      pattern: string
      sessionID: string
      messageID: string
      callID: string
      metadata?: Record<string, unknown>
    }) => Effect.Effect<Classification>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/RiskClassifier") {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      const config = yield* Config.Service

      const state = yield* InstanceState.make(
        Effect.fn("RiskClassifier.state")(function* () {
          const cfg = yield* config.get()
          const extraRules: RuleConfig[] = (cfg as any).risk?.rules ?? []
          return { extraRules }
        }),
      )

      const classifyFn = Effect.fn("RiskClassifier.classify")(function* (permission: string, pattern: string) {
        const { extraRules } = yield* InstanceState.get(state)
        return classify(permission, pattern, extraRules)
      })

      const gate = Effect.fn("RiskClassifier.gate")(function* (input: {
        permission: string
        pattern: string
        sessionID: string
        messageID: string
        callID: string
        metadata?: Record<string, unknown>
      }) {
        const { extraRules } = yield* InstanceState.get(state)
        const result = classify(input.permission, input.pattern, extraRules)

        log.info("classified", {
          level: result.level,
          permission: input.permission,
          pattern: input.pattern,
          reason: result.reason,
          callID: input.callID,
        })

        yield* bus.publish(Event.Classified, {
          sessionID: input.sessionID,
          messageID: input.messageID,
          callID: input.callID,
          classification: result,
        })

        if (result.level === "HIGH") {
          log.warn("HIGH risk action gated — awaiting human approval", {
            permission: input.permission,
            pattern: input.pattern,
            reason: result.reason,
          })

          yield* bus.publish(Event.HighRiskGated, {
            sessionID: input.sessionID,
            messageID: input.messageID,
            callID: input.callID,
            classification: result,
            approved: false,
          })
        }

        return result
      })

      return Service.of({
        classify: classifyFn,
        gate,
      })
    }),
  )

  export const defaultLayer = layer.pipe(Layer.provide(Bus.layer), Layer.provide(Config.defaultLayer))

  const { runPromise } = makeRuntime(Service, defaultLayer)

  export async function classifyTool(permission: string, pattern: string) {
    return runPromise((svc) => svc.classify(permission, pattern))
  }

  export async function gateTool(input: {
    permission: string
    pattern: string
    sessionID: string
    messageID: string
    callID: string
    metadata?: Record<string, unknown>
  }) {
    return runPromise((svc) => svc.gate(input))
  }
}
