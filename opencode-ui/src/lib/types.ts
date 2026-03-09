export type AgentMode = "primary" | "subagent" | "all"

export interface Agent {
  name: string
  description?: string
  mode: AgentMode
  native?: boolean
  hidden?: boolean
  topP?: number
  temperature?: number
  color?: string
  variant?: string
  prompt?: string
  options?: Record<string, unknown>
  steps?: number
}

export interface Session {
  id: string
  slug: string
  projectID: string
  workspaceID?: string
  directory: string
  parentID?: string
  summary?: {
    additions: number
    deletions: number
    files: number
    diffs?: FileDiff[]
  }
  share?: {
    url: string
  }
  title: string
  version: string
  time: {
    created: number
    updated: number
    compacting?: number
    archived?: number
  }
}

export interface FileDiff {
  path: string
  before?: string
  after?: string
}

export type MessageRole = "user" | "assistant"

export interface MessageInfo {
  id: string
  sessionID: string
  role: MessageRole
  agent: string
  modelID: string
  providerID: string
  path: {
    cwd: string
    root: string
  }
  time: {
    created: number
    completed?: number
  }
}

export type PartType =
  | "text"
  | "reasoning"
  | "file"
  | "tool"
  | "step-start"
  | "step-finish"
  | "snapshot"
  | "patch"
  | "agent"
  | "retry"
  | "compaction"
  | "subtask"

export interface BasePart {
  id: string
  sessionID: string
  messageID: string
}

export interface TextPart extends BasePart {
  type: "text"
  text: string
  synthetic?: boolean
  ignored?: boolean
  time?: {
    start: number
    end?: number
  }
}

export interface ReasoningPart extends BasePart {
  type: "reasoning"
  text: string
  time: {
    start: number
    end?: number
  }
}

export interface ToolPart extends BasePart {
  type: "tool"
  tool: string
  input: Record<string, unknown>
  output?: string
  time?: {
    start: number
    end?: number
  }
}

export interface SnapshotPart extends BasePart {
  type: "snapshot"
  snapshot: string
}

export interface PatchPart extends BasePart {
  type: "patch"
  hash: string
  files: string[]
}

export interface StepStartPart extends BasePart {
  type: "step-start"
  snapshot?: string
}

export interface StepFinishPart extends BasePart {
  type: "step-finish"
  reason: string
  snapshot?: string
}

export type MessagePart =
  | TextPart
  | ReasoningPart
  | ToolPart
  | SnapshotPart
  | PatchPart
  | StepStartPart
  | StepFinishPart

export interface Message {
  info: MessageInfo
  parts: MessagePart[]
}

export interface SessionStatus {
  sessionID: string
  status: "idle" | "thinking" | "busy" | "waiting-permission"
  agent?: string
}

export interface PathInfo {
  home: string
  state: string
  config: string
  worktree: string
  directory: string
}

export type ServerEventType =
  | "server.connected"
  | "server.heartbeat"
  | "session.created"
  | "session.updated"
  | "session.deleted"
  | "message.updated"
  | "message.created"
  | "message.removed"
  | "message.part.updated"
  | "message.part.delta"
  | "message.part.removed"
  | "permission.request"
  | "tool.start"
  | "tool.end"

export interface ServerEvent<T = unknown> {
  type: ServerEventType
  properties: T
}
