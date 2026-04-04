/**
 * AutoDream — Idle-time Memory Consolidation
 *
 * Runs when the agent is idle (no active session). Reads the agent's
 * accumulated memory notes, sends them to the model for consolidation,
 * and writes back a cleaned, de-duplicated, contradiction-free summary.
 *
 * Goals:
 *  1. Merge redundant observations into single canonical facts
 *  2. Remove contradictions by preferring newer information
 *  3. Keep total memory size bounded (default 8 KB hard cap)
 *  4. Prevent quality degradation from noise accumulation over weeks
 *
 * Storage layout (under Global.Path.data/autodream/):
 *   notes.json          — raw observation log appended by the agent
 *   consolidated.json   — last consolidated memory snapshot
 *   meta.json           — last run time, version, stats
 */

import z from "zod"
import path from "path"
import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { Config } from "@/config/config"
import { Global } from "@/global"
import { Log } from "@/util/log"
import { Provider } from "@/provider/provider"
import { Storage } from "@/storage/storage"
import { Effect, Layer, ServiceMap } from "effect"
import { makeRuntime } from "@/effect/run-service"
import { InstanceState } from "@/effect/instance-state"

export namespace AutoDream {
  const log = Log.create({ service: "autodream" })

  // ─── Config ───────────────────────────────────────────────────────────────

  /** Hard cap on consolidated memory in characters (~2 KB at default). */
  const DEFAULT_MAX_CHARS = 8_000
  /** Minimum idle time before AutoDream runs (ms). */
  const DEFAULT_IDLE_AFTER_MS = 30_000
  /** Maximum number of raw notes to retain before forcing consolidation. */
  const DEFAULT_MAX_NOTES = 200

  // ─── Schema ───────────────────────────────────────────────────────────────

  export const Note = z.object({
    id: z.string(),
    timestamp: z.number(),
    source: z.enum(["agent", "user", "tool", "system"]),
    text: z.string(),
    tags: z.array(z.string()).default([]),
  })
  export type Note = z.infer<typeof Note>

  export const ConsolidatedMemory = z.object({
    version: z.number(),
    consolidatedAt: z.number(),
    facts: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        confidence: z.enum(["high", "medium", "low"]),
        lastSeen: z.number(),
        tags: z.array(z.string()),
      }),
    ),
    summary: z.string(),
    noteCount: z.number(),
  })
  export type ConsolidatedMemory = z.infer<typeof ConsolidatedMemory>

  export const Meta = z.object({
    lastRunAt: z.number().optional(),
    lastRunDurationMs: z.number().optional(),
    totalConsolidations: z.number().default(0),
    noteCountAtLastRun: z.number().optional(),
  })
  export type Meta = z.infer<typeof Meta>

  // ─── Bus Events ──────────────────────────────────────────────────────────

  export const Event = {
    ConsolidationStarted: BusEvent.define(
      "autodream.consolidation_started",
      z.object({ noteCount: z.number() }),
    ),
    ConsolidationCompleted: BusEvent.define(
      "autodream.consolidation_completed",
      z.object({
        noteCount: z.number(),
        factCount: z.number(),
        durationMs: z.number(),
        bytesSaved: z.number(),
      }),
    ),
    ConsolidationFailed: BusEvent.define(
      "autodream.consolidation_failed",
      z.object({ error: z.string() }),
    ),
    NoteAdded: BusEvent.define(
      "autodream.note_added",
      z.object({ noteId: z.string(), source: z.string() }),
    ),
  }

  // ─── Prompt ───────────────────────────────────────────────────────────────

  const CONSOLIDATION_SYSTEM = `You are a memory consolidation engine for an AI coding agent.

Your task:
1. Read the provided raw memory notes
2. Identify and REMOVE duplicates and near-duplicates
3. Identify and RESOLVE contradictions (prefer the more recent fact)
4. Merge related observations into concise canonical facts
5. Output a clean consolidated memory in JSON

Rules:
- Every fact must be independently verifiable from the input notes
- Do NOT invent facts that are not present in the notes
- Prefer specificity over vagueness
- Keep each fact under 200 characters
- Assign confidence: "high" if multiple notes agree, "medium" for single note, "low" for uncertain
- Output ONLY valid JSON matching the schema — no commentary

Output schema:
{
  "facts": [
    {
      "id": "<short_slug>",
      "text": "<concise fact>",
      "confidence": "high|medium|low",
      "lastSeen": <unix_ms>,
      "tags": ["<tag>"]
    }
  ],
  "summary": "<3-5 sentence overview of what the agent knows>"
}`

  function buildConsolidationPrompt(notes: Note[], existing: ConsolidatedMemory | null): string {
    const parts: string[] = []

    if (existing && existing.facts.length > 0) {
      parts.push("## Existing consolidated memory\n```json")
      parts.push(JSON.stringify(existing.facts, null, 2))
      parts.push("```\n")
    }

    parts.push("## New raw notes to integrate\n")
    for (const note of notes) {
      const date = new Date(note.timestamp).toISOString()
      parts.push(`[${date}] (${note.source}) ${note.text}`)
    }

    parts.push("\n## Instructions\nProduce a consolidated memory JSON as described. Resolve all contradictions, remove duplicates.")

    return parts.join("\n")
  }

  // ─── Storage helpers ─────────────────────────────────────────────────────

  function notesKey(dir: string) {
    return ["autodream", dir, "notes"] as string[]
  }

  function consolidatedKey(dir: string) {
    return ["autodream", dir, "consolidated"] as string[]
  }

  function metaKey(dir: string) {
    return ["autodream", dir, "meta"] as string[]
  }

  // ─── Service ─────────────────────────────────────────────────────────────

  export interface Interface {
    /** Append a new observation note from the agent. */
    readonly addNote: (input: {
      text: string
      source: Note["source"]
      tags?: string[]
    }) => Effect.Effect<Note, unknown>

    /** Read the current consolidated memory snapshot. */
    readonly read: () => Effect.Effect<ConsolidatedMemory | null, unknown>

    /** Read all unconsolidated raw notes. */
    readonly readNotes: () => Effect.Effect<Note[], unknown>

    /**
     * Run a consolidation pass immediately.
     * Normally called by the idle scheduler; can also be called manually.
     */
    readonly consolidate: () => Effect.Effect<ConsolidatedMemory, unknown>

    /**
     * Return consolidated memory formatted for injection into a system prompt.
     * Returns empty string if no memory exists.
     */
    readonly systemPromptBlock: () => Effect.Effect<string, unknown>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@opencode/AutoDream") {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      const config = yield* Config.Service
      const provider = yield* Provider.Service
      const storage = yield* Storage.Service

      const state = yield* InstanceState.make(
        Effect.fn("AutoDream.state")(function* (ctx) {
          const cfg = yield* config.get()
          const autodreamCfg = (cfg as any).memory?.autodream ?? {}
          return {
            dir: ctx.directory,
            maxChars: (autodreamCfg.max_chars as number | undefined) ?? DEFAULT_MAX_CHARS,
            idleAfterMs: (autodreamCfg.idle_after_ms as number | undefined) ?? DEFAULT_IDLE_AFTER_MS,
            maxNotes: (autodreamCfg.max_notes as number | undefined) ?? DEFAULT_MAX_NOTES,
          }
        }),
      )

      const addNote = Effect.fn("AutoDream.addNote")(function* (input: {
        text: string
        source: Note["source"]
        tags?: string[]
      }) {
        const s = yield* InstanceState.get(state)
        const note: Note = {
          id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          timestamp: Date.now(),
          source: input.source,
          text: input.text.slice(0, 1000),
          tags: input.tags ?? [],
        }

        const existing = yield* storage
          .read<Note[]>(notesKey(s.dir))
          .pipe(Effect.catch(() => Effect.succeed([] as Note[])))

        const updated = [...existing, note]
        yield* storage.write(notesKey(s.dir), updated)
        yield* bus.publish(Event.NoteAdded, { noteId: note.id, source: note.source })

        if (updated.length >= s.maxNotes) {
          yield* consolidate().pipe(Effect.ignore)
        }

        return note
      })

      const readNotes = Effect.fn("AutoDream.readNotes")(function* () {
        const s = yield* InstanceState.get(state)
        return yield* storage
          .read<Note[]>(notesKey(s.dir))
          .pipe(Effect.catch(() => Effect.succeed([] as Note[])))
      })

      const read = Effect.fn("AutoDream.read")(function* () {
        const s = yield* InstanceState.get(state)
        return yield* storage
          .read<ConsolidatedMemory>(consolidatedKey(s.dir))
          .pipe(Effect.catch(() => Effect.succeed(null)))
      })

      const consolidate = Effect.fn("AutoDream.consolidate")(function* () {
        const s = yield* InstanceState.get(state)
        const startTime = Date.now()
        const notes = yield* readNotes()

        if (notes.length === 0) {
          const existing = yield* read()
          return (
            existing ?? {
              version: 1,
              consolidatedAt: Date.now(),
              facts: [],
              summary: "",
              noteCount: 0,
            }
          )
        }

        yield* bus.publish(Event.ConsolidationStarted, { noteCount: notes.length })
        log.info("consolidating", { noteCount: notes.length, dir: s.dir })

        const existing = yield* read()

        const model = yield* provider.defaultModel()
        const resolved = yield* provider.getModel(model.providerID, model.modelID)
        const language = yield* provider.getLanguage(resolved)

        const prompt = buildConsolidationPrompt(notes, existing)

        const { generateText } = yield* Effect.promise(() => import("ai"))
        const result = yield* Effect.promise(() =>
          generateText({
            model: language,
            messages: [
              { role: "system", content: CONSOLIDATION_SYSTEM },
              { role: "user", content: prompt },
            ],
            temperature: 0.1,
            maxOutputTokens: 2000,
          }),
        )

        let consolidated: ConsolidatedMemory
        try {
          const raw = JSON.parse(result.text.trim())
          consolidated = {
            version: (existing?.version ?? 0) + 1,
            consolidatedAt: Date.now(),
            facts: raw.facts ?? [],
            summary: raw.summary ?? "",
            noteCount: notes.length,
          }

          const serialized = JSON.stringify(consolidated)
          if (serialized.length > s.maxChars) {
            const order = ["high", "medium", "low"] as const
            for (const confidence of order) {
              if (JSON.stringify(consolidated).length <= s.maxChars) break
              consolidated.facts = consolidated.facts.filter((f) => f.confidence !== confidence || order.indexOf(f.confidence) < order.indexOf(confidence))
            }
            while (JSON.stringify(consolidated).length > s.maxChars && consolidated.facts.length > 0) {
              consolidated.facts.pop()
            }
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err)
          yield* bus.publish(Event.ConsolidationFailed, { error })
          log.error("consolidation parse failed", { error })
          throw new Error(`AutoDream consolidation failed to parse model output: ${error}`)
        }

        const sizeBefore = JSON.stringify(notes).length
        const sizeAfter = JSON.stringify(consolidated).length

        yield* storage.write(consolidatedKey(s.dir), consolidated)
        yield* storage.write(notesKey(s.dir), [])

        const metaExisting = yield* storage
          .read<Meta>(metaKey(s.dir))
          .pipe(Effect.catch(() => Effect.succeed({ totalConsolidations: 0 } as Meta)))
        yield* storage.write(metaKey(s.dir), {
          ...metaExisting,
          lastRunAt: Date.now(),
          lastRunDurationMs: Date.now() - startTime,
          totalConsolidations: (metaExisting.totalConsolidations ?? 0) + 1,
          noteCountAtLastRun: notes.length,
        } satisfies Meta)

        const durationMs = Date.now() - startTime
        yield* bus.publish(Event.ConsolidationCompleted, {
          noteCount: notes.length,
          factCount: consolidated.facts.length,
          durationMs,
          bytesSaved: Math.max(0, sizeBefore - sizeAfter),
        })

        log.info("consolidation complete", {
          facts: consolidated.facts.length,
          durationMs,
          bytesSaved: Math.max(0, sizeBefore - sizeAfter),
        })

        return consolidated
      })

      const systemPromptBlock = Effect.fn("AutoDream.systemPromptBlock")(function* () {
        const mem = yield* read()
        if (!mem || mem.facts.length === 0) return ""

        const lines = [
          "<agent-memory>",
          "The following is consolidated memory from previous sessions. Treat it as background context — verify against the real world before acting on it.",
          "",
        ]

        if (mem.summary) {
          lines.push("## Summary")
          lines.push(mem.summary)
          lines.push("")
        }

        if (mem.facts.length > 0) {
          lines.push("## Known facts")
          for (const fact of mem.facts) {
            const confidence = fact.confidence === "high" ? "✓" : fact.confidence === "medium" ? "~" : "?"
            lines.push(`- [${confidence}] ${fact.text}`)
          }
        }

        lines.push("</agent-memory>")
        return lines.join("\n")
      })

      return Service.of({
        addNote,
        read,
        readNotes,
        consolidate,
        systemPromptBlock,
      })
    }),
  )

  export const defaultLayer = layer.pipe(
    Layer.provide(Bus.layer),
    Layer.provide(Config.defaultLayer),
    Layer.provide(Provider.defaultLayer),
    Layer.provide(Storage.defaultLayer),
  )

  const { runPromise } = makeRuntime(Service, defaultLayer)

  export function addNote(input: { text: string; source: Note["source"]; tags?: string[] }) {
    return runPromise((svc) => svc.addNote(input))
  }

  export function read() {
    return runPromise((svc) => svc.read())
  }

  export function consolidate() {
    return runPromise((svc) => svc.consolidate())
  }

  export function systemPromptBlock() {
    return runPromise((svc) => svc.systemPromptBlock())
  }
}
