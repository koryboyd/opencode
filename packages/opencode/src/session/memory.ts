import { Database } from "../storage/db"
import { MemoryTable } from "./session.sql"
import { eq, desc, and } from "drizzle-orm"
import { Instance } from "../project/instance"
import { randomBytes } from "crypto"

function genId(): string {
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

  export type PublicMemoryEntry = Omit<MemoryEntry, "projectID">

  export async function add(input: {
    content: string
    category?: string
    importance?: number
  }): Promise<PublicMemoryEntry> {
    const now = Date.now()
    const entry: MemoryEntry = {
      id: genId(),
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

    const { projectID: _, ...rest } = entry
    return rest
  }

  export async function get(options?: { category?: string; limit?: number }): Promise<PublicMemoryEntry[]> {
    const projectId = Instance.project.id
    const limit = options?.limit ?? 10
    const category = options?.category

    if (category) {
      const rows = Database.use((db) =>
        db
          .select()
          .from(MemoryTable)
          .where(and(eq(MemoryTable.project_id, projectId), eq(MemoryTable.category, category)))
          .orderBy(desc(MemoryTable.importance), desc(MemoryTable.time_updated))
          .limit(limit)
          .all(),
      )
      return rows.map((row) => ({
        id: row.id,
        content: row.content,
        category: row.category,
        importance: row.importance,
        createdAt: row.time_created,
        updatedAt: row.time_updated,
      }))
    }

    const rows = Database.use((db) =>
      db
        .select()
        .from(MemoryTable)
        .where(eq(MemoryTable.project_id, projectId))
        .orderBy(desc(MemoryTable.importance), desc(MemoryTable.time_updated))
        .limit(limit)
        .all(),
    )

    return rows.map((row) => ({
      id: row.id,
      content: row.content,
      category: row.category,
      importance: row.importance,
      createdAt: row.time_created,
      updatedAt: row.time_updated,
    }))
  }

  export async function remove(id: string): Promise<boolean> {
    const projectId = Instance.project.id
    const existing = Database.use((db) =>
      db
        .select()
        .from(MemoryTable)
        .where(and(eq(MemoryTable.id, id), eq(MemoryTable.project_id, projectId)))
        .get(),
    )
    if (!existing) return false

    Database.use((db) => {
      db.delete(MemoryTable)
        .where(and(eq(MemoryTable.id, id), eq(MemoryTable.project_id, projectId)))
        .run()
    })
    return true
  }

  export async function update(
    id: string,
    input: Partial<{
      content: string
      category: string
      importance: number
    }>,
  ): Promise<PublicMemoryEntry | null> {
    const projectId = Instance.project.id
    const now = Date.now()

    type UpdateFields = {
      time_updated: number
      content?: string
      category?: string
      importance?: number
    }

    const updates: UpdateFields = { time_updated: now }

    if (input.content !== undefined) updates.content = input.content
    if (input.category !== undefined) updates.category = input.category
    if (input.importance !== undefined) updates.importance = input.importance

    const row = Database.use((db) =>
      db
        .update(MemoryTable)
        .set(updates)
        .where(and(eq(MemoryTable.id, id), eq(MemoryTable.project_id, projectId)))
        .returning()
        .get(),
    )

    if (!row) return null

    return {
      id: row.id,
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
