import { randomBytes } from "crypto"
import { appendFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { Instance } from "../project/instance"
import { Session } from "../session"
import { Agent } from "../agent/agent"

const AUDIT_LOG_DIR = "F:/opencode-audit-logs"
const MAX_LOG_SIZE = 10 * 1024 * 1024

function ensureLogDir() {
  if (!existsSync(AUDIT_LOG_DIR)) {
    mkdirSync(AUDIT_LOG_DIR, { recursive: true })
  }
}

function getCurrentLogFile(): string {
  const date = new Date().toISOString().split("T")[0]
  return join(AUDIT_LOG_DIR, `audit-${date}.jsonl`)
}

function rotateLogIfNeeded(filePath: string) {
  try {
    if (existsSync(filePath)) {
      const stats = require("fs").statSync(filePath)
      if (stats.size > MAX_LOG_SIZE) {
        const timestamp = Date.now()
        const rotatedPath = filePath.replace(".jsonl", `-${timestamp}.jsonl`)
        require("fs").renameSync(filePath, rotatedPath)
      }
    }
  } catch {}
}

function genId(): string {
  return randomBytes(8).toHex()
}

export namespace AuditLog {
  export type EventType =
    | "tool_execution"
    | "agent_execution"
    | "session_create"
    | "session_end"
    | "permission_request"
    | "permission_response"
    | "file_read"
    | "file_write"
    | "file_delete"
    | "shell_command"
    | "command_execution"
    | "mcp_tool_execution"
    | "error"

  export type Severity = "info" | "warning" | "error" | "critical"

  export interface AuditEvent {
    id: string
    timestamp: string
    type: EventType
    severity: Severity
    sessionID?: string
    messageID?: string
    agent?: string
    user?: string
    project?: string
    details: Record<string, unknown>
    hiddenDetails?: Record<string, unknown>
    duration?: number
    success: boolean
    error?: string
    truncated?: boolean
  }

  function write(event: AuditEvent) {
    try {
      ensureLogDir()
      const filePath = getCurrentLogFile()
      rotateLogIfNeeded(filePath)
      appendFileSync(filePath, JSON.stringify(event) + "\n", "utf8")
    } catch (err) {
      console.error("Failed to write audit log:", err)
    }
  }

  function base(event: Omit<AuditEvent, "id" | "timestamp">): AuditEvent {
    return {
      id: genId(),
      timestamp: new Date().toISOString(),
      ...event,
    }
  }

  export function toolExecution(params: {
    tool: string
    parameters: Record<string, unknown>
    result?: string
    success: boolean
    error?: string
    duration: number
    sessionID?: string
    messageID?: string
    agent?: string
  }) {
    const isError = !params.success || params.error !== undefined
    const resultPreview = params.result?.substring(0, 500)
    const fullResult = params.result

    write(
      base({
        type: "tool_execution",
        severity: params.success ? "info" : "error",
        sessionID: params.sessionID,
        messageID: params.messageID,
        agent: params.agent,
        project: Instance.directory,
        details: {
          tool: params.tool,
          parameters: sanitizeParameters(params.parameters),
          resultPreview,
        },
        hiddenDetails: isError ? { fullResult } : undefined,
        truncated: params.result !== undefined && params.result.length > 500,
        duration: params.duration,
        success: params.success,
        error: params.error,
      }),
    )
  }

  export function mcpToolExecution(params: {
    server: string
    tool: string
    parameters: Record<string, unknown>
    result?: string
    success: boolean
    error?: string
    duration: number
    sessionID?: string
    messageID?: string
    agent?: string
  }) {
    const isError = !params.success || params.error !== undefined
    const resultPreview = params.result?.substring(0, 500)
    const fullResult = params.result

    write(
      base({
        type: "mcp_tool_execution",
        severity: params.success ? "info" : "error",
        sessionID: params.sessionID,
        messageID: params.messageID,
        agent: params.agent,
        project: Instance.directory,
        details: {
          mcpServer: params.server,
          tool: params.tool,
          parameters: sanitizeParameters(params.parameters),
          resultPreview,
        },
        hiddenDetails: isError ? { fullResult } : undefined,
        truncated: params.result !== undefined && params.result.length > 500,
        duration: params.duration,
        success: params.success,
        error: params.error,
      }),
    )
  }

  export function agentExecution(params: {
    agent: string
    model?: string
    prompt?: string
    success: boolean
    error?: string
    duration: number
    sessionID?: string
    steps?: number
  }) {
    write(
      base({
        type: "agent_execution",
        severity: params.success ? "info" : "error",
        sessionID: params.sessionID,
        agent: params.agent,
        project: Instance.directory,
        details: {
          agent: params.agent,
          model: params.model,
          promptPreview: params.prompt?.substring(0, 500),
          steps: params.steps,
        },
        duration: params.duration,
        success: params.success,
        error: params.error,
      }),
    )
  }

  export function sessionCreate(params: { sessionID: string; agent?: string; model?: string; directory: string }) {
    write(
      base({
        type: "session_create",
        severity: "info",
        sessionID: params.sessionID,
        agent: params.agent,
        project: params.directory,
        details: {
          agent: params.agent,
          model: params.model,
        },
        success: true,
      }),
    )
  }

  export function sessionEnd(params: { sessionID: string; reason?: string }) {
    write(
      base({
        type: "session_end",
        severity: "info",
        sessionID: params.sessionID,
        project: Instance.directory,
        details: { reason: params.reason },
        success: true,
      }),
    )
  }

  export function permissionRequest(params: {
    sessionID: string
    tool: string
    action: string
    resource?: string
    autoApproved?: boolean
  }) {
    write(
      base({
        type: "permission_request",
        severity: "warning",
        sessionID: params.sessionID,
        project: Instance.directory,
        details: {
          tool: params.tool,
          action: params.action,
          resource: params.resource,
          autoApproved: params.autoApproved,
        },
        success: true,
      }),
    )
  }

  export function permissionResponse(params: { sessionID: string; tool: string; approved: boolean; reason?: string }) {
    write(
      base({
        type: "permission_response",
        severity: params.approved ? "info" : "warning",
        sessionID: params.sessionID,
        project: Instance.directory,
        details: {
          tool: params.tool,
          approved: params.approved,
          reason: params.reason,
        },
        success: true,
      }),
    )
  }

  export function fileRead(params: { path: string; sessionID?: string; success: boolean; error?: string }) {
    write(
      base({
        type: "file_read",
        severity: "info",
        sessionID: params.sessionID,
        project: Instance.directory,
        details: { path: params.path },
        success: params.success,
        error: params.error,
      }),
    )
  }

  export function fileWrite(params: {
    path: string
    sessionID?: string
    success: boolean
    error?: string
    size?: number
  }) {
    write(
      base({
        type: "file_write",
        severity: "warning",
        sessionID: params.sessionID,
        project: Instance.directory,
        details: { path: params.path, size: params.size },
        success: params.success,
        error: params.error,
      }),
    )
  }

  export function fileDelete(params: { path: string; sessionID?: string; success: boolean; error?: string }) {
    write(
      base({
        type: "file_delete",
        severity: "critical",
        sessionID: params.sessionID,
        project: Instance.directory,
        details: { path: params.path },
        success: params.success,
        error: params.error,
      }),
    )
  }

  export function shellCommand(params: {
    command: string
    cwd?: string
    sessionID?: string
    agent?: string
    success: boolean
    error?: string
    duration?: number
    exitCode?: number
    output?: string
  }) {
    const isError = !params.success || params.error !== undefined
    const outputPreview = params.output?.substring(0, 500)

    write(
      base({
        type: "shell_command",
        severity: params.success ? "info" : "error",
        sessionID: params.sessionID,
        agent: params.agent,
        project: Instance.directory,
        details: {
          command: params.command,
          cwd: params.cwd,
          exitCode: params.exitCode,
          outputPreview,
        },
        hiddenDetails: isError ? { fullOutput: params.output } : undefined,
        truncated: params.output !== undefined && params.output.length > 500,
        duration: params.duration,
        success: params.success,
        error: params.error,
      }),
    )
  }

  export function commandExecution(params: {
    command: string
    arguments?: string
    agent?: string
    model?: string
    success: boolean
    error?: string
    duration?: number
    sessionID?: string
  }) {
    write(
      base({
        type: "command_execution",
        severity: params.success ? "info" : "error",
        sessionID: params.sessionID,
        agent: params.agent,
        project: Instance.directory,
        details: {
          command: params.command,
          arguments: params.arguments,
          model: params.model,
        },
        duration: params.duration,
        success: params.success,
        error: params.error,
      }),
    )
  }

  export function error(params: {
    source: string
    message: string
    stack?: string
    sessionID?: string
    details?: Record<string, unknown>
  }) {
    write(
      base({
        type: "error",
        severity: "error",
        sessionID: params.sessionID,
        project: Instance.directory,
        details: {
          source: params.source,
          message: params.message,
          stack: params.stack?.substring(0, 2000),
          ...params.details,
        },
        success: false,
        error: params.message,
      }),
    )
  }
}

function sanitizeParameters(params: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  const sensitiveKeys = ["password", "token", "secret", "key", "api_key", "apikey", "authorization"]

  for (const [key, value] of Object.entries(params)) {
    const lowerKey = key.toLowerCase()
    if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
      sanitized[key] = "[REDACTED]"
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeParameters(value as Record<string, unknown>)
    } else {
      sanitized[key] = value
    }
  }

  return sanitized
}
