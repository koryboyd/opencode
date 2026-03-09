import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Agent, Session, Message, SessionStatus } from "@/lib/types"

export type SessionActivityStatus = "idle" | "thinking" | "busy" | "waiting-permission"

interface ChatState {
  sessions: Session[]
  currentSession: Session | null
  messages: Message[]
  agents: Agent[]
  currentAgent: string
  sessionStatuses: Record<string, SessionStatus>
  isLoading: boolean
  isStreaming: boolean
}

interface ChatActions {
  setSessions: (sessions: Session[]) => void
  setCurrentSession: (session: Session | null) => void
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  updateMessage: (messageID: string, updates: Partial<Message>) => void
  appendToLastMessage: (text: string) => void
  setAgents: (agents: Agent[]) => void
  setCurrentAgent: (agent: string) => void
  setSessionStatuses: (statuses: Record<string, SessionStatus>) => void
  updateSessionStatus: (sessionID: string, status: Partial<SessionStatus>) => void
  setLoading: (loading: boolean) => void
  setStreaming: (streaming: boolean) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatState & ChatActions>()(
  persist(
    (set, get) => ({
      sessions: [],
      currentSession: null,
      messages: [],
      agents: [],
      currentAgent: "build",
      sessionStatuses: {},
      isLoading: false,
      isStreaming: false,
      setSessions: (sessions) => set({ sessions }),
      setCurrentSession: (session) => set({ currentSession: session }),
      setMessages: (messages) => set({ messages }),
      addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
      updateMessage: (messageID, updates) =>
        set((state) => ({
          messages: state.messages.map((m) => (m.info.id === messageID ? { ...m, ...updates } : m)),
        })),
      appendToLastMessage: (text) =>
        set((state) => {
          const msgs = [...state.messages]
          if (msgs.length === 0) return state
          const last = msgs[msgs.length - 1]
          if (last.info.role !== "assistant") return state
          const lastPartIdx = last.parts.length - 1
          if (lastPartIdx < 0) return state
          const lastPart = last.parts[lastPartIdx]
          if (lastPart && lastPart.type === "text") {
            const updatedParts = [...last.parts]
            updatedParts[lastPartIdx] = {
              ...lastPart,
              text: lastPart.text + text,
            }
            msgs[msgs.length - 1] = { ...last, parts: updatedParts }
          }
          return { messages: msgs }
        }),
      setAgents: (agents) => set({ agents }),
      setCurrentAgent: (agent) => set({ currentAgent: agent }),
      setSessionStatuses: (statuses) => set({ sessionStatuses: statuses }),
      updateSessionStatus: (sessionID, statusUpdate) =>
        set((state) => ({
          sessionStatuses: {
            ...state.sessionStatuses,
            [sessionID]: {
              ...state.sessionStatuses[sessionID],
              sessionID,
              status: "idle",
              ...statusUpdate,
            },
          },
        })),
      setLoading: (loading) => set({ isLoading: loading }),
      setStreaming: (streaming) => set({ isStreaming: streaming }),
      clearMessages: () => set({ messages: [] }),
    }),
    {
      name: "opencode-chat",
      partialize: (state) => ({
        currentAgent: state.currentAgent,
      }),
    },
  ),
)

export const selectCurrentSessionStatus = (state: ChatState): SessionActivityStatus => {
  const { currentSession, sessionStatuses } = state
  if (!currentSession) return "idle"
  return sessionStatuses[currentSession.id]?.status ?? "idle"
}
