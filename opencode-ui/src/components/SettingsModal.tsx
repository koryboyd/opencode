import { useConnectionStore } from "@/stores/connectionStore"
import { useUIStore } from "@/stores/uiStore"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { X, Sun, Moon, Monitor } from "lucide-react"

interface SettingsModalProps {
  onConnect: () => void
}

export function SettingsModal({ onConnect }: SettingsModalProps) {
  const { settingsOpen, setSettingsOpen, theme, setTheme } = useUIStore()
  const { baseUrl, directory, username, password, setBaseUrl, setDirectory, setCredentials, isConnecting } =
    useConnectionStore()

  if (!settingsOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Settings</CardTitle>
            <CardDescription>Configure your OpenCode connection</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Server URL</Label>
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://localhost:4096" />
          </div>
          <div className="space-y-2">
            <Label>Working Directory</Label>
            <Input value={directory} onChange={(e) => setDirectory(e.target.value)} placeholder="C:\path\to\project" />
          </div>
          <div className="space-y-2">
            <Label>Username (optional)</Label>
            <Input value={username} onChange={(e) => setCredentials(e.target.value, password)} placeholder="opencode" />
          </div>
          <div className="space-y-2">
            <Label>Password (optional)</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setCredentials(username, e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-2">
            <Label>Theme</Label>
            <div className="flex gap-2">
              <Button variant={theme === "light" ? "default" : "outline"} size="sm" onClick={() => setTheme("light")}>
                <Sun className="mr-2 h-4 w-4" />
                Light
              </Button>
              <Button variant={theme === "dark" ? "default" : "outline"} size="sm" onClick={() => setTheme("dark")}>
                <Moon className="mr-2 h-4 w-4" />
                Dark
              </Button>
              <Button variant={theme === "system" ? "default" : "outline"} size="sm" onClick={() => setTheme("system")}>
                <Monitor className="mr-2 h-4 w-4" />
                System
              </Button>
            </div>
          </div>
          <Button className="w-full" onClick={onConnect} disabled={isConnecting}>
            {isConnecting ? "Connecting..." : "Connect"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
