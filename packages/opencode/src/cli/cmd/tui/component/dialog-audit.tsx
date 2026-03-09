import { TextAttributes } from "@opentui/core"
import { readFileSync, existsSync } from "fs"
import { useTheme } from "../context/theme"
import { useDialog } from "@tui/ui/dialog"
import { For, Show, createSignal, createMemo, onMount } from "solid-js"

const AUDIT_LOG_DIR = "F:/opencode-audit-logs"

interface AuditLogEntry {
  id: string
  timestamp: string
  type: string
  severity: string
  sessionID?: string
  agent?: string
  project?: string
  details: Record<string, unknown>
  hiddenDetails?: Record<string, unknown>
  duration?: number
  success: boolean
  error?: string
  truncated?: boolean
}

export function DialogAuditLog() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set())
  const [logs, setLogs] = createSignal<AuditLogEntry[]>([])
  const [filter, setFilter] = createSignal<"all" | "errors" | "tools">("all")

  onMount(() => {
    try {
      if (existsSync(AUDIT_LOG_DIR)) {
        const { readdirSync } = require("fs")
        const dirFiles = readdirSync(AUDIT_LOG_DIR)
          .filter((f: string) => f.startsWith("audit-") && f.endsWith(".jsonl"))
          .sort()
          .reverse()
          .slice(0, 7)
        const entries: AuditLogEntry[] = []
        for (const file of dirFiles) {
          const content = readFileSync(`${AUDIT_LOG_DIR}/${file}`, "utf8")
          const lines = content.split("\n").filter((l: string) => l.trim())
          for (const line of lines) {
            try {
              entries.push(JSON.parse(line) as AuditLogEntry)
            } catch {}
          }
        }
        entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        setLogs(entries)
      }
    } catch (e) {
      console.error("Failed to load audit logs:", e)
    }
  })

  const filteredLogs = createMemo(() => {
    const f = filter()
    return logs().filter((log) => {
      if (f === "errors") return !log.success || log.severity === "error" || log.severity === "critical"
      if (f === "tools")
        return log.type === "tool_execution" || log.type === "shell_command" || log.type === "mcp_tool_execution"
      return true
    })
  })

  const toggleExpand = (id: string) => {
    const current = expanded()
    const next = new Set(current)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setExpanded(next)
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString()
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
      case "error":
        return theme.error
      case "warning":
        return theme.warning
      default:
        return theme.textMuted
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "tool_execution":
        return "T"
      case "shell_command":
        return "$"
      case "mcp_tool_execution":
        return "M"
      case "agent_execution":
        return "A"
      case "file_write":
        return "W"
      case "file_delete":
        return "D"
      case "error":
        return "E"
      default:
        return "-"
    }
  }

  return (
    <box paddingLeft={1} paddingRight={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between" alignItems="center">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Audit Log
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>

      <box flexDirection="row" gap={2}>
        <text fg={filter() === "all" ? theme.primary : theme.textMuted} onMouseUp={() => setFilter("all")}>
          All
        </text>
        <text fg={filter() === "errors" ? theme.error : theme.textMuted} onMouseUp={() => setFilter("errors")}>
          Errors
        </text>
        <text fg={filter() === "tools" ? theme.primary : theme.textMuted} onMouseUp={() => setFilter("tools")}>
          Tools
        </text>
      </box>

      <Show when={logs().length === 0}>
        <text fg={theme.textMuted}>No audit logs found</text>
      </Show>

      <box flexDirection="column" gap={0} height={Math.min(20, filteredLogs().length)}>
        <For each={filteredLogs().slice(0, 30)}>
          {(log) => (
            <box flexDirection="column" gap={0}>
              <box flexDirection="row" gap={1} onMouseUp={() => toggleExpand(log.id)}>
                <text fg={getSeverityColor(log.severity)}>{getTypeIcon(log.type)}</text>
                <text fg={theme.text}>{formatTime(log.timestamp)}</text>
                <text fg={theme.textMuted}>{log.type.replace("_execution", "").replace("_", " ")}</text>
                <Show when={log.details.tool || log.details.command || log.details.mcpServer}>
                  <text fg={theme.text}>
                    {String(log.details.tool || log.details.command || log.details.mcpServer)}
                  </text>
                </Show>
                <Show when={log.duration}>
                  <text fg={theme.textMuted}>{log.duration}ms</text>
                </Show>
                <Show when={!log.success}>
                  <text fg={theme.error}>FAIL</text>
                </Show>
                <Show when={log.hiddenDetails || log.truncated}>
                  <text fg={theme.textMuted}>{expanded().has(log.id) ? "[-]" : "[+]"}</text>
                </Show>
              </box>

              <Show when={expanded().has(log.id)}>
                <box flexDirection="column" paddingLeft={4} gap={0}>
                  <Show when={log.agent}>
                    <text fg={theme.textMuted}>Agent: {log.agent}</text>
                  </Show>
                  <Show when={log.sessionID}>
                    <text fg={theme.textMuted}>Session: {log.sessionID}</text>
                  </Show>
                  <Show when={log.project}>
                    <text fg={theme.textMuted}>Project: {log.project}</text>
                  </Show>
                  <Show when={log.details.parameters}>
                    <text fg={theme.textMuted}>Params: {JSON.stringify(log.details.parameters)}</text>
                  </Show>
                  <Show when={log.hiddenDetails?.fullResult as boolean}>
                    <text fg={theme.error}>Full Result:</text>
                    <text fg={theme.text}>
                      {JSON.stringify((log.hiddenDetails as Record<string, unknown>).fullResult, null, 2)}
                    </text>
                  </Show>
                  <Show when={log.hiddenDetails?.fullOutput as boolean}>
                    <text fg={theme.error}>Full Output:</text>
                    <text fg={theme.text}>{String((log.hiddenDetails as Record<string, unknown>).fullOutput)}</text>
                  </Show>
                  <Show when={log.error}>
                    <text fg={theme.error}>Error: {log.error}</text>
                  </Show>
                </box>
              </Show>
            </box>
          )}
        </For>
      </box>

      <text fg={theme.textMuted}>
        Showing {filteredLogs().slice(0, 30).length} of {filteredLogs().length}
      </text>
    </box>
  )
}
