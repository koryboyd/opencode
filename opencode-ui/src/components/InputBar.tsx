import { useState, useCallback, useRef } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { useChatStore } from "@/stores/chatStore"
import { useConnectionStore } from "@/stores/connectionStore"
import { useOpenCode } from "@/hooks/useOpenCode"
import { Send, Loader2, Square } from "lucide-react"
import { toast } from "sonner"

export function InputBar() {
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { currentSession, currentAgent, messages, addMessage, setMessages } = useChatStore()
  const { isConnected } = useConnectionStore()
  const { sendMessage } = useOpenCode()

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || !currentSession || !isConnected) return

    const userInput = input.trim()
    setInput("")
    setIsLoading(true)

    try {
      const userMessage = {
        info: {
          id: `temp-${Date.now()}`,
          sessionID: currentSession.id,
          role: "user" as const,
          agent: currentAgent,
          modelID: "",
          providerID: "",
          path: { cwd: "", root: "" },
          time: { created: Date.now() },
        },
        parts: [{ type: "text" as const, text: userInput, id: "", sessionID: "", messageID: "" }],
      }
      addMessage(userMessage)

      const response = await fetch(`${window.location.origin}/session/${currentSession.id}/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Opencode-Directory": useConnectionStore.getState().directory || "",
        },
        body: JSON.stringify({ prompt: userInput, agent: currentAgent }),
      })

      if (!response.ok) throw new Error("Failed to send message")

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        const assistantMessage = {
          info: {
            id: `temp-${Date.now()}-assistant`,
            sessionID: currentSession.id,
            role: "assistant" as const,
            agent: currentAgent,
            modelID: "",
            providerID: "",
            path: { cwd: "", root: "" },
            time: { created: Date.now() },
          },
          parts: [] as any[],
        }
        addMessage(assistantMessage)

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          try {
            const data = JSON.parse(chunk)
            const currentMsgs = useChatStore.getState().messages
            const lastMsg = currentMsgs[currentMsgs.length - 1]
            if (lastMsg && lastMsg.info.role === "assistant") {
              const textPart = lastMsg.parts.find((p: any) => p.type === "text")
              if (textPart) {
                textPart.text += data.text || ""
              }
            }
          } catch {}
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send message")
    } finally {
      setIsLoading(false)
    }
  }, [input, currentSession, currentAgent, isConnected, addMessage])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="border-t bg-card p-4">
      <div className="mx-auto max-w-3xl">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isConnected ? "Message OpenCode... (Ctrl+Enter to send)" : "Connect to server first"}
            disabled={!isConnected || isLoading}
            className="min-h-[60px] resize-none"
          />
          <Button onClick={handleSubmit} disabled={!input.trim() || !isConnected || isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">Press Ctrl+Enter to send • {currentAgent} agent active</div>
      </div>
    </div>
  )
}
