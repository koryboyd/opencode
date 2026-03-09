import type { Message, TextPart, ReasoningPart, ToolPart, SnapshotPart, PatchPart } from "@/lib/types"
import { cn } from "@/lib/utils"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { CodeBlock } from "./CodeBlock"
import { User, Bot } from "lucide-react"

interface ChatMessageProps {
  message: Message
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.info.role === "user"

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "")}>
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={cn("max-w-[80%] rounded-lg px-4 py-2", isUser ? "bg-primary text-primary-foreground" : "bg-muted")}
      >
        <div className="text-xs opacity-60 mb-1">
          {message.info.agent} • {message.info.modelID}
        </div>
        {message.parts.map((part, idx) => (
          <MessagePart key={part.id || idx} part={part} />
        ))}
      </div>
    </div>
  )
}

function MessagePart({ part }: { part: TextPart | ReasoningPart | ToolPart | SnapshotPart | PatchPart }) {
  switch (part.type) {
    case "text":
      return (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || "")
                const isInline = !match
                return isInline ? (
                  <code className={className} {...props}>
                    {children}
                  </code>
                ) : (
                  <CodeBlock code={String(children).replace(/\n$/, "")} language={match[1]} />
                )
              },
            }}
          >
            {part.text}
          </ReactMarkdown>
        </div>
      )
    case "reasoning":
      return <div className="text-xs italic text-muted-foreground border-l-2 pl-2 my-2">Reasoning: {part.text}</div>
    case "tool":
      return (
        <div className="my-2 rounded border bg-card p-2 text-xs">
          <div className="font-medium">{part.tool}</div>
          <pre className="mt-1 overflow-x-auto text-muted-foreground">{JSON.stringify(part.input, null, 2)}</pre>
        </div>
      )
    case "snapshot":
      return (
        <div className="my-2 rounded border bg-card p-2 text-xs">
          <div className="font-medium">Snapshot</div>
          <pre className="mt-1 overflow-x-auto text-muted-foreground">{part.snapshot}</pre>
        </div>
      )
    case "patch":
      return (
        <div className="my-2 rounded border bg-card p-2 text-xs">
          <div className="font-medium">Changes: {part.files.join(", ")}</div>
        </div>
      )
    default:
      return null
  }
}
