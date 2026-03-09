import { useEffect, useCallback } from "react"
import { Toaster } from "sonner"
import { useTheme } from "@/hooks/useTheme"
import { useOpenCode } from "@/hooks/useOpenCode"
import { useConnectionStore } from "@/stores/connectionStore"
import { useUIStore } from "@/stores/uiStore"
import { Sidebar } from "@/components/Sidebar"
import { ChatArea } from "@/components/ChatArea"
import { InputBar } from "@/components/InputBar"
import { SettingsModal } from "@/components/SettingsModal"
import { Button } from "@/components/ui/button"
import { Loader2, WifiOff } from "lucide-react"

function AppContent() {
  useTheme()
  const { isConnected, isConnecting } = useConnectionStore()
  const { setSettingsOpen, settingsOpen } = useUIStore()
  const { connect, subscribeToEvents } = useOpenCode()

  useEffect(() => {
    if (isConnected) {
      subscribeToEvents()
    }
  }, [isConnected, subscribeToEvents])

  const handleConnect = useCallback(async () => {
    await connect()
  }, [connect])

  if (!isConnected && !isConnecting) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">OpenCode</h1>
          <p className="text-muted-foreground mb-6">Connect to your OpenCode server</p>
          <Button onClick={handleConnect}>Connect to Server</Button>
          <Button variant="link" className="mt-4" onClick={() => setSettingsOpen(true)}>
            Configure Settings
          </Button>
        </div>
        <SettingsModal onConnect={handleConnect} />
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <ChatArea />
        <InputBar />
      </div>
      <SettingsModal onConnect={handleConnect} />
    </div>
  )
}

export default function App() {
  return (
    <>
      <Toaster position="bottom-right" />
      <AppContent />
    </>
  )
}
