import { useCallback, useRef } from "react"
import { toast } from "sonner"
import { useConnectionStore } from "@/stores/connectionStore"
import { useChatStore } from "@/stores/chatStore"
import { initClient } from "@/lib/api"
import type { ServerEvent, Session } from "@/lib/types"

export function useOpenCode() {
  const { baseUrl, directory, username, password, setConnected, setConnecting, setError } = useConnectionStore()
  const { setSessions, setAgents, setMessages, setCurrentSession, setSessionStatuses } = useChatStore()
  const clientRef = useRef<ReturnType<typeof initClient> | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  const connect = useCallback(async () => {
    setConnecting(true)
    setError(null)

    try {
      const client = initClient({
        baseUrl,
        directory: directory || undefined,
        username: username || undefined,
        password: password || undefined,
      })
      clientRef.current = client

      const [agents, sessions, statuses] = await Promise.all([
        client.getAgents(),
        client.listSessions(),
        client.getSessionStatus().catch(() => ({})),
      ])

      setAgents(agents)
      setSessions(sessions)
      setSessionStatuses(statuses as Record<string, any>)

      if (sessions.length > 0) {
        const sorted = [...sessions].sort((a, b) => b.time.updated - a.time.updated)
        const current = sorted[0]
        setCurrentSession(current)
        const messages = await client.getSessionMessages(current.id)
        setMessages(messages)
      }

      setConnected(true)
      return client
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to connect"
      setError(message)
      toast.error(message)
      return null
    }
  }, [
    baseUrl,
    directory,
    username,
    password,
    setConnected,
    setConnecting,
    setError,
    setAgents,
    setSessions,
    setCurrentSession,
    setMessages,
    setSessionStatuses,
  ])

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    setConnected(false)
  }, [setConnected])

  const createSession = useCallback(
    async (agent?: string) => {
      const client = clientRef.current
      if (!client) {
        toast.error("Not connected to server")
        return null
      }

      try {
        const session = await client.createSession(agent)
        setSessions((prev: Session[]) => [session, ...prev])
        setCurrentSession(session)
        setMessages([])
        return session
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create session"
        toast.error(message)
        return null
      }
    },
    [setSessions, setCurrentSession, setMessages],
  )

  const sendMessage = useCallback(async (prompt: string) => {
    const client = clientRef.current
    const { currentSession, currentAgent } = useChatStore.getState()

    if (!client || !currentSession) {
      toast.error("Not connected or no active session")
      return null
    }

    try {
      const response = await client.sendMessage(currentSession.id, prompt, currentAgent)
      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`)
      }
      return response
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send message"
      toast.error(message)
      return null
    }
  }, [])

  const subscribeToEvents = useCallback(() => {
    const client = clientRef.current
    if (!client) return

    const eventSource = client.createEventSource()
    eventSourceRef.current = eventSource

    eventSource.onmessage = (event: MessageEvent) => {
      try {
        const data: ServerEvent = JSON.parse(event.data)
        handleServerEvent(data)
      } catch (err) {
        console.error("Failed to parse event:", err)
      }
    }

    eventSource.onerror = () => {
      toast.error("Event stream disconnected")
      setConnected(false)
    }

    return () => {
      eventSource.close()
    }
  }, [setConnected])

  const handleServerEvent = useCallback(
    (event: ServerEvent) => {
      const { type, properties } = event as any

      switch (type) {
        case "message.part.delta": {
          const { sessionID, delta } = properties as { sessionID: string; delta: string }
          const { currentSession, messages } = useChatStore.getState()
          if (currentSession?.id === sessionID && messages.length > 0) {
            useChatStore.getState().appendToLastMessage(delta)
          }
          break
        }
        case "session.status": {
          const statuses = properties as Record<string, { sessionID: string; status: string; agent?: string }>
          setSessionStatuses(
            Object.fromEntries(Object.entries(statuses).map(([id, s]) => [id, { sessionID: id, ...s } as any])),
          )
          break
        }
        case "session.updated": {
          const session = properties as Session
          const { sessions } = useChatStore.getState()
          const idx = sessions.findIndex((s) => s.id === session.id)
          if (idx >= 0) {
            const newSessions = [...sessions]
            newSessions[idx] = session
            useChatStore.getState().setSessions(newSessions)
          }
          break
        }
        default:
          break
      }
    },
    [setSessionStatuses],
  )

  return {
    connect,
    disconnect,
    createSession,
    sendMessage,
    subscribeToEvents,
    client: clientRef.current,
  }
}
