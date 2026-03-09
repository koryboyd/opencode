import { useChatStore } from "@/stores/chatStore"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ChatMessage } from "./ChatMessage"

export function ChatArea() {
  const { messages, currentSession } = useChatStore()

  if (!currentSession) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
        <p>No session selected</p>
        <p className="text-sm">Start a new session to begin</p>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1 p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        {messages.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            <p className="text-lg font-medium">Welcome to {currentSession.title || "OpenCode"}</p>
            <p className="mt-2 text-sm">Send a message to start the conversation</p>
          </div>
        )}
        {messages.map((message) => (
          <ChatMessage key={message.info.id} message={message} />
        ))}
      </div>
    </ScrollArea>
  )
}
