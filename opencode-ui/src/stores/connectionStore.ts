import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface ConnectionState {
  baseUrl: string
  directory: string
  username: string
  password: string
  isConnected: boolean
  isConnecting: boolean
  error: string | null
}

interface ConnectionActions {
  setBaseUrl: (url: string) => void
  setDirectory: (dir: string) => void
  setCredentials: (username: string, password: string) => void
  setConnected: (connected: boolean) => void
  setConnecting: (connecting: boolean) => void
  setError: (error: string | null) => void
}

export const useConnectionStore = create<ConnectionState & ConnectionActions>()(
  persist(
    (set) => ({
      baseUrl: "http://localhost:4096",
      directory: "",
      username: "",
      password: "",
      isConnected: false,
      isConnecting: false,
      error: null,
      setBaseUrl: (url) => set({ baseUrl: url }),
      setDirectory: (dir) => set({ directory: dir }),
      setCredentials: (username, password) => set({ username, password }),
      setConnected: (connected) => set({ isConnected: connected, isConnecting: false }),
      setConnecting: (connecting) => set({ isConnecting: connecting }),
      setError: (error) => set({ error, isConnecting: false }),
    }),
    {
      name: "opencode-connection",
    },
  ),
)
