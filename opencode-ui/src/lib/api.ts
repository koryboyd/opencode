import type { Agent, Session, Message, SessionStatus, PathInfo } from "./types"

export interface OpenCodeConfig {
  baseUrl: string
  directory?: string
  username?: string
  password?: string
}

export class OpenCodeClient {
  private baseUrl: string
  private directory?: string
  private auth?: { username: string; password: string }

  constructor(config: OpenCodeConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "")
    this.directory = config.directory
    if (config.username && config.password) {
      this.auth = { username: config.username, password: config.password }
    }
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    }
    if (this.directory) {
      headers["X-Opencode-Directory"] = encodeURIComponent(this.directory)
    }
    if (this.auth) {
      const encoded = btoa(`${this.auth.username}:${this.auth.password}`)
      headers["Authorization"] = `Basic ${encoded}`
    }
    return headers
  }

  async getAgents(): Promise<Agent[]> {
    const res = await fetch(`${this.baseUrl}/agent`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to get agents: ${res.statusText}`)
    return res.json()
  }

  async listSessions(): Promise<Session[]> {
    const res = await fetch(`${this.baseUrl}/session`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to list sessions: ${res.statusText}`)
    return res.json()
  }

  async createSession(agent?: string): Promise<Session> {
    const res = await fetch(`${this.baseUrl}/session`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(agent ? { agent } : {}),
    })
    if (!res.ok) throw new Error(`Failed to create session: ${res.statusText}`)
    return res.json()
  }

  async getSession(sessionID: string): Promise<Session> {
    const res = await fetch(`${this.baseUrl}/session/${sessionID}`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to get session: ${res.statusText}`)
    return res.json()
  }

  async deleteSession(sessionID: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/session/${sessionID}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to delete session: ${res.statusText}`)
    return res.json()
  }

  async getSessionMessages(sessionID: string): Promise<Message[]> {
    const res = await fetch(`${this.baseUrl}/session/${sessionID}/message`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to get messages: ${res.statusText}`)
    return res.json()
  }

  async getSessionStatus(): Promise<Record<string, SessionStatus>> {
    const res = await fetch(`${this.baseUrl}/session/status`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to get session status: ${res.statusText}`)
    return res.json()
  }

  async sendMessage(sessionID: string, prompt: string, agent?: string): Promise<Response> {
    const res = await fetch(`${this.baseUrl}/session/${sessionID}/message`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ prompt, agent }),
    })
    if (!res.ok) throw new Error(`Failed to send message: ${res.statusText}`)
    return res
  }

  async abortSession(sessionID: string): Promise<boolean> {
    const res = await fetch(`${this.baseUrl}/session/${sessionID}/abort`, {
      method: "POST",
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to abort session: ${res.statusText}`)
    return res.json()
  }

  async getPath(): Promise<PathInfo> {
    const res = await fetch(`${this.baseUrl}/path`, {
      headers: this.getHeaders(),
    })
    if (!res.ok) throw new Error(`Failed to get path: ${res.statusText}`)
    return res.json()
  }

  createEventSource(): EventSource {
    const url = new URL(`${this.baseUrl}/event`)
    if (this.directory) {
      url.searchParams.set("directory", this.directory)
    }
    return new EventSource(url.toString())
  }
}

let globalClient: OpenCodeClient | null = null

export function initClient(config: OpenCodeConfig): OpenCodeClient {
  globalClient = new OpenCodeClient(config)
  return globalClient
}

export function getClient(): OpenCodeClient | null {
  return globalClient
}
