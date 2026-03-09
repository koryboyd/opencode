import { Database } from "../storage/db"
import { MemoryTable } from "./session.sql"
import { eq, desc, and } from "drizzle-orm"
import { Instance } from "../project/instance"
import { randomBytes } from "crypto"

function generateMemoryId(): string {
  return "mem_" + randomBytes(8).toString("hex")
}

export namespace SessionMemory {
  export type MemoryEntry = {
    id: string
    projectID: string
    content: string
    category: string
    importance: number
    createdAt: number
    updatedAt: number
  }

  export async function add(input: { content: string; category?: string; importance?: number }): Promise<MemoryEntry> {
    const now = Date.now()
    const entry: MemoryEntry = {
      id: generateMemoryId(),
      projectID: Instance.project.id,
      content: input.content,
      category: input.category ?? "general",
      importance: input.importance ?? 0,
      createdAt: now,
      updatedAt: now,
    }

    Database.use((db) => {
      db.insert(MemoryTable)
        .values({
          id: entry.id,
          project_id: entry.projectID,
          content: entry.content,
          category: entry.category,
          importance: entry.importance,
          time_created: entry.createdAt,
          time_updated: entry.updatedAt,
        })
        .run()
    })

    return entry
  }

  export async function get(options?: { category?: string; limit?: number }): Promise<MemoryEntry[]> {
    const projectId = Instance.project.id
    const limit = options?.limit ?? 10
    const category = options?.category

    let rows
    if (category) {
      rows = Database.use((db) =>
        db
          .select()
          .from(MemoryTable)
          .where(and(eq(MemoryTable.project_id, projectId), eq(MemoryTable.category, category)))
          .orderBy(desc(MemoryTable.importance), desc(MemoryTable.time_updated))
          .limit(limit)
          .all(),
      )
    } else {
      rows = Database.use((db) =>
        db
          .select()
          .from(MemoryTable)
          .where(eq(MemoryTable.project_id, projectId))
          .orderBy(desc(MemoryTable.importance), desc(MemoryTable.time_updated))
          .limit(limit)
          .all(),
      )
    }

    return rows.map((row) => ({
      id: row.id,
      projectID: row.project_id,
      content: row.content,
      category: row.category,
      importance: row.importance,
      createdAt: row.time_created,
      updatedAt: row.time_updated,
    }))
  }

  export async function remove(id: string): Promise<void> {
    Database.use((db) => {
      db.delete(MemoryTable).where(eq(MemoryTable.id, id)).run()
    })
  }

  export async function update(
    id: string,
    input: Partial<{
      content: string
      category: string
      importance: number
    }>,
  ): Promise<MemoryEntry | null> {
    const now = Date.now()
    const updates: Record<string, any> = { time_updated: now }

    if (input.content !== undefined) updates.content = input.content
    if (input.category !== undefined) updates.category = input.category
    if (input.importance !== undefined) updates.importance = input.importance

    const row = Database.use((db) =>
      db.update(MemoryTable).set(updates).where(eq(MemoryTable.id, id)).returning().get(),
    )

    if (!row) return null

    return {
      id: row.id,
      projectID: row.project_id,
      content: row.content,
      category: row.category,
      importance: row.importance,
      createdAt: row.time_created,
      updatedAt: row.time_updated,
    }
  }

  export async function getContext(): Promise<string> {
    const memories = await get({ limit: 5 })
    if (memories.length === 0) return ""

    const sections = memories.map((m) => `[${m.category}] ${m.content}`)
    return `\n\n<!-- Persistent Memory -->\n${sections.join("\n")}\n`
  }
}
