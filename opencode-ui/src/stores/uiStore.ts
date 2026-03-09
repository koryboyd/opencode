import { create } from "zustand"
import { persist } from "zustand/middleware"

export type Theme = "light" | "dark" | "system"

interface UIState {
  theme: Theme
  sidebarOpen: boolean
  settingsOpen: boolean
  autoScroll: boolean
}

interface UIActions {
  setTheme: (theme: Theme) => void
  setSidebarOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setAutoScroll: (auto: boolean) => void
}

export const useUIStore = create<UIState & UIActions>()(
  persist(
    (set) => ({
      theme: "dark",
      sidebarOpen: true,
      settingsOpen: false,
      autoScroll: true,
      setTheme: (theme) => set({ theme }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      setSettingsOpen: (open) => set({ settingsOpen: open }),
      setAutoScroll: (auto) => set({ autoScroll: auto }),
    }),
    {
      name: "opencode-ui",
    },
  ),
)
