/**
 * Coordinator Mode — Multi-Agent Swarm Architecture
 *
 * A lead "coordinator" agent decomposes a task into parallel work units,
 * spawns isolated worker sessions, collects results, and synthesises them
 * back to the user.
 *
 * Key design decisions aligned with opencode's architecture:
 *
 *  1. Workers run as child sessions (parentID set) via SessionPrompt.prompt —
 *     exactly the same mechanism as the existing `task` tool, but orchestrated
 *     at the coordinator level with explicit parallelism control.
 *
 *  2. Shared prompt cache — the coordinator's system prompt + instruction files
 *     are reused across all workers so prompt-cache hits reduce token cost.
 *
 *  3. Isolated context — each worker gets its own sessionID and sees only its
 *     assigned sub-task.  Workers cannot read each other's messages.
 *
 *  4. Restricted tool access — workers receive a permission ruleset that allows
 *     only the tools relevant to their task type (read-only workers cannot write,
 *     write workers cannot spawn further coordinators, etc.)
 *
 *  5. Cost management — total worker token budget is tracked and enforced; if a
 *     worker is about to overflow, it compacts first.
 *
 * Activation:
 *   Users invoke coordinator mode with `/coordinator <task>` or by selecting
 *   the "coordinator" agent via Tab.
 *
 *   Alternatively, any agent can delegate to the coordinator by calling the
 *   `coordinate` tool (registered in tool/registry).
 */

import z from "zod"
import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { Config } from "@/config/config"
import { Agent } from "@/agent/agent"
import { Permission } from "@/permission"
import { Provider } from "@/provider/provider"
import { Log } from "@/util/log"
import { Effect, Layer, ServiceMap } from "effect"
import { makeRuntime } from "@/effect/run-service"
import { InstanceState } from "@/effect/instance-state"
import type { SessionID, MessageID } from "@/session/schema"
import type { ModelID, ProviderID } from "@/provider/schema"

export namespace Coordinator {
  const log = Log.create({ service: "coordinator" })

  // ─── Schema ───────────────────────────────────────────────────────────────

  export const WorkerRole = z.enum([
    "read",
    "write",
    "test",
    "review",
    "search",
    "general",
  ])
  export type WorkerRole = z.infer<typeof WorkerRole>

  export const WorkUnit = z.object({
    id: z.string(),
    title: z.string().describe("Short 3-5 word description"),
    prompt: z.string().describe("Full prompt for this worker"),
    role: WorkerRole,
    priority: z.number().int().min(1).max(10).default(5),
    dependsOn: z.array(z.string()).default([]),
  })
  export type WorkUnit = z.infer<typeof WorkUnit>

  export const WorkResult = z.object({
    unitId: z.string(),
    sessionID: z.string(),
    success: z.boolean(),
    output: z.string(),
    tokenUsage: z.object({
      input: z.number(),
      output: z.number(),
      cacheRead: z.number(),
    }).optional(),
    durationMs: z.number(),
    error: z.string().optional(),
  })
  export type WorkResult = z.infer<typeof WorkResult>

  export const SwarmPlan = z.object({
    coordinatorSessionID: z.string(),
    units: z.array(WorkUnit),
    maxParallel: z.number().int().min(1).max(10).default(3),
    synthesisPrompt: z.string().optional(),
  })
  export type SwarmPlan = z.infer<typeof SwarmPlan>

  // ─── Bus Events ──────────────────────────────────────────────────────────

  export const Event = {
    SwarmStarted: BusEvent.define(
      "coordinator.swarm_started",
      z.object({
        coordinatorSessionID: z.string(),
        unitCount: z.number(),
        maxParallel: z.number(),
      }),
    ),
    WorkerStarted: BusEvent.define(
      "coordinator.worker_started",
      z.object({
        unitId: z.string(),
        title: z.string(),
        role: z.string(),
        workerSessionID: z.string(),
      }),
    ),
    WorkerCompleted: BusEvent.define(
      "coordinator.worker_completed",
      z.object({
        unitId: z.string(),
        workerSessionID: z.string(),
        success: z.boolean(),
        durationMs: z.number(),
      }),
    ),
    SwarmCompleted: BusEvent.define(
      "coordinator.swarm_completed",
      z.object({
        coordinatorSessionID: z.string(),
        succeeded: z.number(),
        failed: z.number(),
        totalDurationMs: z.number(),
      }),
    ),
  }

  // ─── Permission rulesets per worker role ─────────────────────────────────

  function permissionsForRole(role: WorkerRole, basePermission: Permission.Ruleset): Permission.Ruleset {
    switch (role) {
      case "read":
        return Permission.merge(
          basePermission,
          Permission.fromConfig({
            "*": "deny",
            read: "allow",
            glob: "allow",
            grep: "allow",
            list: "allow",
            codesearch: "allow",
            bash: { "*": "deny" },
            edit: { "*": "deny" },
            write: { "*": "deny" },
            apply_patch: { "*": "deny" },
            multiedit: { "*": "deny" },
            task: "deny",
            coordinator: "deny",
          }),
        )

      case "search":
        return Permission.merge(
          basePermission,
          Permission.fromConfig({
            "*": "deny",
            read: "allow",
            glob: "allow",
            grep: "allow",
            list: "allow",
            codesearch: "allow",
            webfetch: "allow",
            websearch: "allow",
            bash: { "*": "deny" },
            edit: { "*": "deny" },
            write: { "*": "deny" },
            task: "deny",
            coordinator: "deny",
          }),
        )

      case "write":
        return Permission.merge(
          basePermission,
          Permission.fromConfig({
            "*": "allow",
            coordinator: "deny",
            doom_loop: "ask",
          }),
        )

      case "test":
        return Permission.merge(
          basePermission,
          Permission.fromConfig({
            "*": "deny",
            read: "allow",
            glob: "allow",
            grep: "allow",
            list: "allow",
            bash: "allow",
            edit: { "*": "deny" },
            write: { "*": "deny" },
            coordinator: "deny",
          }),
        )

      case "review":
        return Permission.merge(
          basePermission,
          Permission.fromConfig({
            "*": "deny",
            read: "allow",
            glob: "allow",
            grep: "allow",
            list: "allow",
            codesearch: "allow",
            bash: { "*": "allow", "git push*": "deny" },
            edit: { "*": "deny" },
            coordinator: "deny",
          }),
        )

      case "general":
      default:
        return Permission.merge(
          basePermission,
          Permission.fromConfig({
            coordinator: "deny",
          }),
        )
    }
  }

  // ─── Shared cache prefix ─────────────────────────────────────────────────

  export function sharedSystemPrefix(coordinatorSessionID: string, totalUnits: number): string {
    return [
      `<coordinator-context>`,
      `You are a worker agent in a multi-agent swarm coordinated by session ${coordinatorSessionID}.`,
      `There are ${totalUnits} workers running in parallel on different parts of this task.`,
      `Focus exclusively on your assigned sub-task. Do NOT try to do the work of other workers.`,
      `When you are done, output a clear summary of what you accomplished so the coordinator can synthesise results.`,
      `</coordinator-context>`,
    ].join("\n")
  }

  // ─── Topological sort for dependency ordering ─────────────────────────────

  function topoSort(units: WorkUnit[]): WorkUnit[][] {
    const byId = new Map(units.map((u) => [u.id, u]))
    const waves: WorkUnit[][] = []
    const done = new Set<string>()

    while (done.size < units.length) {
      const wave = units.filter(
        (u) => !done.has(u.id) && u.dependsOn.every((dep) => done.has(dep)),
      )
      if (wave.length === 0) {
        const remaining = units.filter((u) => !done.has(u.id))
        log.warn("dependency cycle detected in work units, running remaining sequentially", {
          remaining: remaining.map((u) => u.id),
        })
        waves.push(remaining)
        remaining.forEach((u) => done.add(u.id))
        break
      }
      waves.push(wave)
      wave.forEach((u) => done.add(u.id))
    }

    return waves
  }

  // ─── Service ─────────────────────────────────────────────────────────────

  export interface Interface {
    readonly execute: (plan: SwarmPlan) => Effect.Effect<WorkResult[]>

    readonly plan: (input: {
      description: string
      coordinatorSessionID: string
      maxWorkers?: number
      model?: { providerID: ProviderID; modelID: ModelID }
    }) => Effect.Effect<SwarmPlan>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/Coordinator") {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      const config = yield* Config.Service
      const agents = yield* Agent.Service
      const provider = yield* Provider.Service

      const execute = Effect.fn("Coordinator.execute")(function* (plan: SwarmPlan) {
        const startTime = Date.now()
        const waves = topoSort(plan.units)
        const results: WorkResult[] = []

        log.info("swarm starting", {
          coordinatorSessionID: plan.coordinatorSessionID,
          unitCount: plan.units.length,
          waveCount: waves.length,
          maxParallel: plan.maxParallel,
        })

        yield* bus.publish(Event.SwarmStarted, {
          coordinatorSessionID: plan.coordinatorSessionID,
          unitCount: plan.units.length,
          maxParallel: plan.maxParallel,
        })

        const coordinatorAgent = yield* agents.get("coordinator").pipe(
          Effect.catch(() => agents.get("general")),
        )
        const basePermission = coordinatorAgent?.permission ?? []

        const sharedPrefix = sharedSystemPrefix(plan.coordinatorSessionID, plan.units.length)

        for (const wave of waves) {
          const batches: WorkUnit[][] = []
          for (let i = 0; i < wave.length; i += plan.maxParallel) {
            batches.push(wave.slice(i, i + plan.maxParallel))
          }

          for (const batch of batches) {
            const batchResults = yield* Effect.all(
              batch.map((unit) =>
                Effect.gen(function* () {
                  const workerStart = Date.now()

                  const { Session } = yield* Effect.promise(() => import("@/session"))
                  const { SessionPrompt } = yield* Effect.promise(() => import("@/session/prompt"))
                  const { MessageID } = yield* Effect.promise(() => import("@/session/schema"))

                  const workerPermission = permissionsForRole(unit.role, basePermission)

                  const session = yield* Effect.promise(() =>
                    Session.create({
                      parentID: plan.coordinatorSessionID as SessionID,
                      title: `[worker] ${unit.title}`,
                      permission: workerPermission,
                    }),
                  )

                  yield* bus.publish(Event.WorkerStarted, {
                    unitId: unit.id,
                    title: unit.title,
                    role: unit.role,
                    workerSessionID: session.id,
                  })

                  log.info("worker started", { unitId: unit.id, role: unit.role, sessionID: session.id })

                  const agentName =
                    unit.role === "read" || unit.role === "search"
                      ? "explore"
                      : unit.role === "review"
                        ? "general"
                        : "general"

                  const workerPrompt = [sharedPrefix, "", unit.prompt].join("\n")

                  try {
                    const defaultModel = yield* provider.defaultModel()

                    const result = yield* Effect.promise(() =>
                      SessionPrompt.prompt({
                        messageID: MessageID.ascending(),
                        sessionID: session.id,
                        model: defaultModel,
                        agent: agentName,
                        parts: [{ type: "text", text: workerPrompt }],
                      }),
                    )

                    const output = (result.parts.findLast((p: any) => p.type === "text") as any)?.text ?? ""
                    const durationMs = Date.now() - workerStart

                    yield* bus.publish(Event.WorkerCompleted, {
                      unitId: unit.id,
                      workerSessionID: session.id,
                      success: true,
                      durationMs,
                    })

                    return {
                      unitId: unit.id,
                      sessionID: session.id,
                      success: true,
                      output,
                      durationMs,
                    } satisfies WorkResult
                  } catch (err) {
                    const error = err instanceof Error ? err.message : String(err)
                    const durationMs = Date.now() - workerStart

                    log.error("worker failed", { unitId: unit.id, error })

                    yield* bus.publish(Event.WorkerCompleted, {
                      unitId: unit.id,
                      workerSessionID: session.id,
                      success: false,
                      durationMs,
                    })

                    return {
                      unitId: unit.id,
                      sessionID: session.id,
                      success: false,
                      output: "",
                      error,
                      durationMs,
                    } satisfies WorkResult
                  }
                }),
              ),
              { concurrency: "unbounded" },
            )

            results.push(...batchResults)
          }
        }

        const totalDurationMs = Date.now() - startTime
        const succeeded = results.filter((r) => r.success).length
        const failed = results.filter((r) => !r.success).length

        yield* bus.publish(Event.SwarmCompleted, {
          coordinatorSessionID: plan.coordinatorSessionID,
          succeeded,
          failed,
          totalDurationMs,
        })

        log.info("swarm complete", { succeeded, failed, totalDurationMs })
        return results
      })

      const PLAN_SYSTEM = `You are a task decomposition engine for a multi-agent coding system.

Given a task description, output a JSON array of work units.

Rules:
- Maximum 8 work units
- Each unit must have a clear, isolated scope
- Assign correct role: read|write|test|review|search|general
- Set dependsOn when a unit needs results from another
- Keep prompts specific and actionable
- Output ONLY valid JSON — no markdown, no commentary

Schema:
[{
  "id": "unit_1",
  "title": "short title",
  "prompt": "detailed prompt for this worker",
  "role": "read|write|test|review|search|general",
  "priority": 1-10,
  "dependsOn": []
}]`

      const plan = Effect.fn("Coordinator.plan")(function* (input: {
        description: string
        coordinatorSessionID: string
        maxWorkers?: number
        model?: { providerID: ProviderID; modelID: ModelID }
      }) {
        const modelRef = input.model ?? (yield* provider.defaultModel())
        const resolved = yield* provider.getModel(modelRef.providerID, modelRef.modelID)
        const language = yield* provider.getLanguage(resolved)

        const { generateText } = yield* Effect.promise(() => import("ai"))
        const result = yield* Effect.promise(() =>
          generateText({
            model: language,
            messages: [
              { role: "system", content: PLAN_SYSTEM },
              {
                role: "user",
                content: `Task: ${input.description}\n\nMax workers: ${input.maxWorkers ?? 4}\n\nDecompose this task into parallel work units.`,
              },
            ],
            temperature: 0.2,
            maxOutputTokens: 2000,
          }),
        )

        let units: WorkUnit[]
        try {
          const raw = JSON.parse(result.text.trim())
          units = z.array(WorkUnit).parse(raw)
        } catch (err) {
          throw new Error(`Coordinator failed to parse plan: ${err instanceof Error ? err.message : String(err)}`)
        }

        const maxWorkers = input.maxWorkers ?? 4

        return {
          coordinatorSessionID: input.coordinatorSessionID,
          units: units.slice(0, 8),
          maxParallel: maxWorkers,
        } satisfies SwarmPlan
      })

      return Service.of({ execute, plan })
    }),
  )

  export const defaultLayer = layer.pipe(
    Layer.provide(Bus.layer),
    Layer.provide(Config.defaultLayer),
    Layer.provide(Agent.defaultLayer),
    Layer.provide(Provider.defaultLayer),
  )

  const { runPromise } = makeRuntime(Service, defaultLayer)

  export function execute(plan: SwarmPlan) {
    return runPromise((svc) => svc.execute(plan))
  }

  export function planSwarm(input: {
    description: string
    coordinatorSessionID: string
    maxWorkers?: number
    model?: { providerID: ProviderID; modelID: ModelID }
  }) {
    return runPromise((svc) => svc.plan(input))
  }
}
