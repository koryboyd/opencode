import { Tool } from "./tool"
import z from "zod"
import { Coordinator } from "@/coordinator"
import type { SessionID } from "@/session/schema"

const parameters = z.object({
  description: z.string().describe("High-level description of the task to decompose and execute as a swarm"),
  units: z
    .array(
      z.object({
        id: z.string().describe("Unique identifier for this work unit (e.g. unit_1)"),
        title: z.string().describe("Short 3-5 word description"),
        prompt: z.string().describe("Detailed prompt for the worker agent"),
        role: z
          .enum(["read", "write", "test", "review", "search", "general"])
          .describe("Worker role — controls tool access"),
        priority: z.number().int().min(1).max(10).default(5).describe("Execution priority (1=highest)"),
        dependsOn: z
          .array(z.string())
          .default([])
          .describe("IDs of units that must complete before this one starts"),
      }),
    )
    .min(1)
    .max(8)
    .describe("Work units to execute in parallel. Maximum 8."),
  max_parallel: z
    .number()
    .int()
    .min(1)
    .max(8)
    .default(3)
    .describe("Maximum number of workers running simultaneously"),
})

export const CoordinateTool = Tool.define("coordinate", async (_ctx) => {
  return {
    description: `Execute a multi-agent swarm to complete a complex task in parallel.

Use this tool when:
- A task has clearly separable sub-tasks that can run simultaneously
- Different parts of a task require different tool access (read vs write)
- You want to explore multiple aspects of a codebase concurrently

Each worker runs in an isolated session with restricted tools based on its role:
- read: read, glob, grep, list, codesearch only
- search: above + webfetch, websearch
- write: all tools except spawning further coordinators
- test: read tools + bash (no writes)
- review: read tools + bash (no git push)
- general: all tools, except spawning further coordinators

Workers share a system prompt cache prefix to reduce token costs.`,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      const plan: Coordinator.SwarmPlan = {
        coordinatorSessionID: ctx.sessionID as string,
        units: params.units.map((u) => ({
          ...u,
          dependsOn: u.dependsOn ?? [],
          priority: u.priority ?? 5,
        })),
        maxParallel: params.max_parallel ?? 3,
      }

      ctx.metadata({
        title: `Coordinating: ${params.description}`,
        metadata: {
          unitCount: params.units.length,
          maxParallel: params.max_parallel,
        },
      })

      const results = await Coordinator.execute(plan)

      const succeeded = results.filter((r) => r.success)
      const failed = results.filter((r) => !r.success)

      const lines: string[] = [
        `## Swarm Results`,
        ``,
        `**Workers:** ${results.length} total, ${succeeded.length} succeeded, ${failed.length} failed`,
        ``,
      ]

      for (const result of results) {
        const unit = params.units.find((u) => u.id === result.unitId)
        const status = result.success ? "✓" : "✗"
        lines.push(`### ${status} ${unit?.title ?? result.unitId} (${unit?.role ?? "unknown"})`)
        lines.push(`*Session: ${result.sessionID} — ${result.durationMs}ms*`)
        lines.push(``)
        if (result.error) {
          lines.push(`**Error:** ${result.error}`)
        } else {
          lines.push(result.output || "_No output_")
        }
        lines.push(``)
      }

      if (failed.length > 0) {
        lines.push(`## Failed workers`)
        for (const r of failed) {
          lines.push(`- ${r.unitId}: ${r.error}`)
        }
      }

      return {
        title: `Swarm: ${params.description}`,
        metadata: {
          succeeded: succeeded.length,
          failed: failed.length,
          units: results.map((r) => ({
            id: r.unitId,
            sessionID: r.sessionID,
            success: r.success,
          })),
        },
        output: lines.join("\n"),
      }
    },
  }
})
