/**
 * Skeptical Memory — Three-Layer Verify-Before-Act Memory
 *
 * The agent treats its own memory as a hint rather than a fact.
 * Before acting on anything it "remembers", it verifies the claim
 * against the real world (filesystem, git, live output) and only
 * then proceeds.
 *
 * Three layers:
 *
 *   Layer 1 — Ephemeral (in-session scratch):
 *     Raw, unverified observations made during the current session.
 *     Never trusted directly; always candidates for Layer 2 promotion.
 *
 *   Layer 2 — Verified (cross-session persistent):
 *     Facts that have been confirmed against ground truth at least once.
 *     Stored in AutoDream's consolidated memory.  Can still become stale.
 *
 *   Layer 3 — Ground Truth (live verification):
 *     Filesystem reads, git status, shell output, web fetches.
 *     Always authoritative.  Used to confirm / deny Layer 1 & 2 claims.
 *
 * When a Layer 1 or 2 fact is queried:
 *   → Agent sees a "skeptical context block" in its system prompt:
 *       "I believe X, but this may be outdated — verify before acting."
 *   → A verification obligation is appended to the user message so the
 *     model actually performs the check rather than skipping it.
 */

import z from "zod"
import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { Config } from "@/config/config"
import { Log } from "@/util/log"
import { Storage } from "@/storage/storage"
import { Effect, Layer, ServiceMap } from "effect"
import { makeRuntime } from "@/effect/run-service"
import { InstanceState } from "@/effect/instance-state"
import { AutoDream } from "./autodream"

export namespace SkepticalMemory {
  const log = Log.create({ service: "skeptical-memory" })

  // ─── Schema ───────────────────────────────────────────────────────────────

  export const VerificationStatus = z.enum(["unverified", "verified", "refuted", "stale"])
  export type VerificationStatus = z.infer<typeof VerificationStatus>

  export const Claim = z.object({
    id: z.string(),
    text: z.string(),
    layer: z.enum(["ephemeral", "verified"]),
    status: VerificationStatus,
    createdAt: z.number(),
    verifiedAt: z.number().optional(),
    refutedAt: z.number().optional(),
    refutedBy: z.string().optional(),
    confidence: z.number().min(0).max(1),
    tags: z.array(z.string()).default([]),
    sessionID: z.string().optional(),
    verificationHint: z.string().optional(),
  })
  export type Claim = z.infer<typeof Claim>

  export const VerificationResult = z.object({
    claimId: z.string(),
    status: VerificationStatus,
    evidence: z.string(),
    verifiedAt: z.number(),
  })
  export type VerificationResult = z.infer<typeof VerificationResult>

  // ─── Bus Events ──────────────────────────────────────────────────────────

  export const Event = {
    ClaimAdded: BusEvent.define(
      "skeptical_memory.claim_added",
      z.object({ claimId: z.string(), layer: z.string() }),
    ),
    ClaimVerified: BusEvent.define(
      "skeptical_memory.claim_verified",
      z.object({ claimId: z.string(), text: z.string() }),
    ),
    ClaimRefuted: BusEvent.define(
      "skeptical_memory.claim_refuted",
      z.object({ claimId: z.string(), text: z.string(), refutedBy: z.string() }),
    ),
    VerificationObligationCreated: BusEvent.define(
      "skeptical_memory.verification_obligation",
      z.object({ claimCount: z.number(), sessionID: z.string() }),
    ),
  }

  // ─── System prompt helpers ─────────────────────────────────────────────

  /**
   * Generates the skeptical memory block for injection into the system prompt.
   * Includes Layer 2 (verified) facts labeled with their confidence.
   */
  export function buildSystemBlock(claims: Claim[], autodreamSummary: string): string {
    const verifiedClaims = claims.filter((c) => c.layer === "verified" && c.status !== "refuted")
    const parts: string[] = []

    parts.push("<skeptical-memory>")
    parts.push(
      "IMPORTANT: The following facts come from your memory system. " +
        "Treat them as HINTS, not ground truth. " +
        "You MUST verify any memory-based claim against the real world " +
        "(filesystem, git, shell output) before acting on it. " +
        "Confident errors caused by stale memory are unacceptable.",
    )
    parts.push("")

    if (autodreamSummary) {
      parts.push("## Consolidated agent memory (AutoDream)")
      parts.push(autodreamSummary)
      parts.push("")
    }

    if (verifiedClaims.length > 0) {
      parts.push("## Layer 2 — Previously verified facts (may be stale)")
      for (const claim of verifiedClaims) {
        const age = claim.verifiedAt ? Math.floor((Date.now() - claim.verifiedAt) / 60_000) : null
        const ageStr = age !== null ? ` (verified ${age}m ago)` : ""
        const conf = Math.round(claim.confidence * 100)
        parts.push(`- [${conf}% confidence${ageStr}] ${claim.text}`)
        if (claim.verificationHint) {
          parts.push(`  → Verify by: ${claim.verificationHint}`)
        }
      }
      parts.push("")
    }

    parts.push(
      "Before using any of the above, run the appropriate verification tool " +
        "(read, bash, glob, grep) to confirm the fact is still true.",
    )
    parts.push("</skeptical-memory>")

    return parts.join("\n")
  }

  /**
   * Builds a verification obligation text appended to the user message
   * when there are unverified ephemeral claims that may affect the task.
   */
  export function buildVerificationObligation(unverifiedClaims: Claim[]): string {
    if (unverifiedClaims.length === 0) return ""

    const lines = [
      "<verification-obligation>",
      "You have the following UNVERIFIED observations from this session. " +
        "Before acting on them, you MUST verify each one:",
      "",
    ]

    for (const claim of unverifiedClaims) {
      lines.push(`- [ ] UNVERIFIED: "${claim.text}"`)
      if (claim.verificationHint) {
        lines.push(`      How to verify: ${claim.verificationHint}`)
      }
    }

    lines.push("")
    lines.push(
      "Do NOT skip verification. Mark each item verified or refuted by running the appropriate tool call first.",
    )
    lines.push("</verification-obligation>")

    return lines.join("\n")
  }

  // ─── Storage helpers ─────────────────────────────────────────────────────

  function claimsKey(dir: string) {
    return ["skeptical-memory", dir, "claims"] as string[]
  }

  // ─── Service ─────────────────────────────────────────────────────────────

  export interface Interface {
    /** Add an ephemeral (unverified) claim from the current session. */
    readonly addEphemeral: (input: {
      text: string
      sessionID: string
      confidence?: number
      tags?: string[]
      verificationHint?: string
    }) => Effect.Effect<Claim, unknown>

    /** Record that a claim has been verified against ground truth. */
    readonly markVerified: (input: {
      claimId: string
      evidence: string
    }) => Effect.Effect<VerificationResult, unknown>

    /** Record that a claim has been refuted. */
    readonly markRefuted: (input: {
      claimId: string
      refutedBy: string
    }) => Effect.Effect<VerificationResult, unknown>

    /** Promote a verified ephemeral claim to Layer 2 (persistent). */
    readonly promote: (claimId: string) => Effect.Effect<Claim, unknown>

    /** Get all claims for the current project directory. */
    readonly list: (filter?: { layer?: Claim["layer"]; status?: VerificationStatus }) => Effect.Effect<Claim[], unknown>

    /**
     * Build the full system prompt block combining Layer 2 claims
     * and AutoDream consolidated memory.
     */
    readonly systemPromptBlock: (sessionID: string) => Effect.Effect<string, unknown>

    /**
     * Build the verification obligation block for the user message turn.
     * Includes only ephemeral unverified claims from this session.
     */
    readonly verificationObligation: (sessionID: string) => Effect.Effect<string, unknown>

    /** Evict stale claims (no verification in >7 days by default). */
    readonly evictStale: (maxAgeMs?: number) => Effect.Effect<number, unknown>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/SkepticalMemory") {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      const config = yield* Config.Service
      const storage = yield* Storage.Service
      const autodream = yield* AutoDream.Service

      const state = yield* InstanceState.make(
        Effect.fn("SkepticalMemory.state")(function* (ctx) {
          return { dir: ctx.directory }
        }),
      )

      const getClaims = Effect.fn("SkepticalMemory.getClaims")(function* () {
        const s = yield* InstanceState.get(state)
        return yield* storage
          .read<Claim[]>(claimsKey(s.dir))
          .pipe(Effect.catch(() => Effect.succeed([] as Claim[])))
      })

      const saveClaims = Effect.fn("SkepticalMemory.saveClaims")(function* (claims: Claim[]) {
        const s = yield* InstanceState.get(state)
        yield* storage.write(claimsKey(s.dir), claims)
      })

      const addEphemeral = Effect.fn("SkepticalMemory.addEphemeral")(function* (input: {
        text: string
        sessionID: string
        confidence?: number
        tags?: string[]
        verificationHint?: string
      }) {
        const claim: Claim = {
          id: `claim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          text: input.text.slice(0, 500),
          layer: "ephemeral",
          status: "unverified",
          createdAt: Date.now(),
          confidence: input.confidence ?? 0.5,
          tags: input.tags ?? [],
          sessionID: input.sessionID,
          verificationHint: input.verificationHint,
        }

        const existing = yield* getClaims()
        yield* saveClaims([...existing, claim])
        yield* bus.publish(Event.ClaimAdded, { claimId: claim.id, layer: claim.layer })
        log.info("ephemeral claim added", { id: claim.id, text: claim.text.slice(0, 80) })
        return claim
      })

      const markVerified = Effect.fn("SkepticalMemory.markVerified")(function* (input: {
        claimId: string
        evidence: string
      }) {
        const claims = yield* getClaims()
        const idx = claims.findIndex((c) => c.id === input.claimId)
        if (idx === -1) throw new Error(`Claim not found: ${input.claimId}`)

        claims[idx] = {
          ...claims[idx]!,
          status: "verified",
          verifiedAt: Date.now(),
          confidence: Math.min(1, (claims[idx]!.confidence ?? 0.5) + 0.2),
        }

        yield* saveClaims(claims)
        yield* bus.publish(Event.ClaimVerified, {
          claimId: input.claimId,
          text: claims[idx]!.text,
        })

        return {
          claimId: input.claimId,
          status: "verified" as const,
          evidence: input.evidence,
          verifiedAt: Date.now(),
        }
      })

      const markRefuted = Effect.fn("SkepticalMemory.markRefuted")(function* (input: {
        claimId: string
        refutedBy: string
      }) {
        const claims = yield* getClaims()
        const idx = claims.findIndex((c) => c.id === input.claimId)
        if (idx === -1) throw new Error(`Claim not found: ${input.claimId}`)

        claims[idx] = {
          ...claims[idx]!,
          status: "refuted",
          refutedAt: Date.now(),
          refutedBy: input.refutedBy,
          confidence: 0,
        }

        yield* saveClaims(claims)
        yield* bus.publish(Event.ClaimRefuted, {
          claimId: input.claimId,
          text: claims[idx]!.text,
          refutedBy: input.refutedBy,
        })

        yield* autodream.addNote({
          text: `REFUTED: "${claims[idx]!.text}" — contradicted by: ${input.refutedBy}`,
          source: "system",
          tags: ["refutation"],
        })

        return {
          claimId: input.claimId,
          status: "refuted" as const,
          evidence: input.refutedBy,
          verifiedAt: Date.now(),
        }
      })

      const promote = Effect.fn("SkepticalMemory.promote")(function* (claimId: string) {
        const claims = yield* getClaims()
        const idx = claims.findIndex((c) => c.id === claimId)
        if (idx === -1) throw new Error(`Claim not found: ${claimId}`)

        const claim = claims[idx]!
        if (claim.status !== "verified") {
          throw new Error(`Cannot promote unverified claim: ${claimId}`)
        }

        claims[idx] = { ...claim, layer: "verified" }
        yield* saveClaims(claims)

        yield* autodream.addNote({
          text: claim.text,
          source: "agent",
          tags: claim.tags,
        })

        log.info("claim promoted to layer 2", { id: claimId })
        return claims[idx]!
      })

      const list = Effect.fn("SkepticalMemory.list")(function* (
        filter?: { layer?: Claim["layer"]; status?: VerificationStatus },
      ) {
        const claims = yield* getClaims()
        if (!filter) return claims
        return claims.filter((c) => {
          if (filter.layer && c.layer !== filter.layer) return false
          if (filter.status && c.status !== filter.status) return false
          return true
        })
      })

      const systemPromptBlock = Effect.fn("SkepticalMemory.systemPromptBlock")(function* (sessionID: string) {
        const claims = yield* getClaims()
        const autoDreamBlock = yield* autodream.systemPromptBlock()
        return buildSystemBlock(claims, autoDreamBlock)
      })

      const verificationObligation = Effect.fn("SkepticalMemory.verificationObligation")(function* (
        sessionID: string,
      ) {
        const claims = yield* getClaims()
        const unverified = claims.filter(
          (c) => c.layer === "ephemeral" && c.status === "unverified" && c.sessionID === sessionID,
        )

        if (unverified.length > 0) {
          yield* bus.publish(Event.VerificationObligationCreated, {
            claimCount: unverified.length,
            sessionID,
          })
        }

        return buildVerificationObligation(unverified)
      })

      const evictStale = Effect.fn("SkepticalMemory.evictStale")(function* (
        maxAgeMs: number = 7 * 24 * 60 * 60 * 1000,
      ) {
        const claims = yield* getClaims()
        const cutoff = Date.now() - maxAgeMs
        const fresh = claims.filter((c) => {
          if (c.status === "refuted") return false
          const lastSeen = c.verifiedAt ?? c.createdAt
          return lastSeen >= cutoff
        })
        const evicted = claims.length - fresh.length
        if (evicted > 0) {
          yield* saveClaims(fresh)
          log.info("evicted stale claims", { evicted })
        }
        return evicted
      })

      return Service.of({
        addEphemeral,
        markVerified,
        markRefuted,
        promote,
        list,
        systemPromptBlock,
        verificationObligation,
        evictStale,
      })
    }),
  )

  export const defaultLayer = layer.pipe(
    Layer.provide(Bus.layer),
    Layer.provide(Config.defaultLayer),
    Layer.provide(Storage.defaultLayer),
    Layer.provide(AutoDream.defaultLayer),
  )

  const { runPromise } = makeRuntime(Service, defaultLayer)

  export function addEphemeral(input: {
    text: string
    sessionID: string
    confidence?: number
    tags?: string[]
    verificationHint?: string
  }) {
    return runPromise((svc) => svc.addEphemeral(input))
  }

  export function list(filter?: { layer?: Claim["layer"]; status?: VerificationStatus }) {
    return runPromise((svc) => svc.list(filter))
  }

  export function systemPromptBlock(sessionID: string) {
    return runPromise((svc) => svc.systemPromptBlock(sessionID))
  }

  export function verificationObligation(sessionID: string) {
    return runPromise((svc) => svc.verificationObligation(sessionID))
  }

  export function consolidateToAutoDream() {
    return runPromise((svc) =>
      Effect.gen(function* () {
        const verified = yield* svc.list({ status: "verified" })
        for (const claim of verified) {
          if (claim.layer === "ephemeral") yield* svc.promote(claim.id)
        }
        yield* svc.evictStale()
      }),
    )
  }
}
