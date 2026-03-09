import { useChatStore } from "@/stores/chatStore"
import { useConnectionStore } from "@/stores/connectionStore"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Bot, Circle, Settings, Plus, PanelLeftClose, PanelLeft, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useUIStore } from "@/stores/uiStore"

export function Sidebar() {
  const { agents, currentAgent, setCurrentAgent, sessions, currentSession, setCurrentSession } = useChatStore()
  const { isConnected, isConnecting } = useConnectionStore()
  const { sidebarOpen, setSidebarOpen, setSettingsOpen } = useUIStore()

  const visibleAgents = agents.filter((a) => !a.hidden && a.mode !== "subagent")

  if (!sidebarOpen) {
    return (
      <div className="flex h-full w-12 flex-col items-center border-r bg-card py-4">
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
          <PanelLeft className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      <div className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <span className="font-semibold">OpenCode</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2 border-b p-3">
        <div className={cn("h-2 w-2 rounded-full", isConnected ? "bg-green-500" : "bg-red-500")} />
        <span className="text-xs text-muted-foreground">
          {isConnecting ? "Connecting..." : isConnected ? "Connected" : "Disconnected"}
        </span>
      </div>

      <div className="border-b p-3">
        <div className="mb-2 text-xs font-medium text-muted-foreground">Agent</div>
        <div className="flex flex-wrap gap-1">
          {visibleAgents.map((agent) => (
            <Button
              key={agent.name}
              variant={currentAgent === agent.name ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setCurrentAgent(agent.name)}
              className="text-xs"
            >
              {agent.name}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Sessions</span>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          <ScrollArea className="h-[calc(100vh-320px)]">
            <div className="space-y-1">
              {sessions.slice(0, 10).map((session) => (
                <button
                  key={session.id}
                  onClick={() => setCurrentSession(session)}
                  className={cn(
                    "w-full truncate rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                    currentSession?.id === session.id && "bg-accent",
                  )}
                >
                  {session.title || "Untitled"}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      <div className="border-t p-3">
        <Button variant="ghost" className="w-full justify-start" onClick={() => setSettingsOpen(true)}>
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </Button>
      </div>
    </div>
  )
}
