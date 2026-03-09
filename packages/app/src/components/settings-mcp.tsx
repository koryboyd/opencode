import { Button } from "@opencode-ai/ui/button"
import { Switch } from "@opencode-ai/ui/switch"
import { showToast } from "@opencode-ai/ui/toast"
import { Component, For, Show, createMemo } from "solid-js"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"

type McpStatus =
  | { status: "connected" }
  | { status: "disabled" }
  | { status: "failed"; error: string }
  | { status: "needs_auth" }
  | { status: "needs_client_registration"; error: string }

export const SettingsMcp: Component = () => {
  const language = useLanguage()
  const sdk = useSDK()
  const sync = useSync()

  const mcpServers = createMemo(() => {
    const data = sync.data.mcp ?? {}
    return Object.entries(data).map(([name, info]) => ({
      name,
      ...info,
    })) as Array<{ name: string } & McpStatus>
  })

  const connectedCount = createMemo(() => mcpServers().filter((s) => s.status === "connected").length)
  const totalCount = createMemo(() => mcpServers().length)

  const toggleServer = async (name: string, currentlyConnected: boolean) => {
    try {
      if (currentlyConnected) {
        await sdk.client.mcp.disconnect({ name })
      } else {
        await sdk.client.mcp.connect({ name })
      }
      const result = await sdk.client.mcp.status()
      if (result.data) sync.set("mcp", result.data)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
    }
  }

  const getStatusLabel = (status: McpStatus["status"]) => {
    switch (status) {
      case "connected":
        return language.t("mcp.status.connected")
      case "failed":
        return language.t("mcp.status.failed")
      case "needs_auth":
        return language.t("mcp.status.needs_auth")
      case "disabled":
        return language.t("mcp.status.disabled")
      case "needs_client_registration":
        return language.t("mcp.status.needs_client_registration") ?? "Needs client registration"
      default:
        return status
    }
  }

  const getStatusColor = (status: McpStatus["status"]) => {
    switch (status) {
      case "connected":
        return "text-text-success"
      case "failed":
        return "text-text-error"
      case "needs_auth":
        return "text-text-warning"
      case "disabled":
        return "text-text-weak"
      default:
        return "text-text-weak"
    }
  }

  const getError = (server: { name: string } & McpStatus): string | undefined => {
    if (server.status === "failed") return server.error
    if (server.status === "needs_client_registration") return server.error
    return undefined
  }

  const handleAuthenticate = async (name: string) => {
    try {
      await sdk.client.mcp.auth.authenticate({ name })
      const result = await sdk.client.mcp.status()
      if (result.data) sync.set("mcp", result.data)
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("mcp.auth.success.title") ?? "Authentication successful",
        description: language.t("mcp.auth.success.description") ?? `Successfully authenticated with ${name}`,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      showToast({ title: language.t("common.requestFailed"), description: message })
    }
  }

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-1 pt-6 pb-8 max-w-[720px]">
          <h2 class="text-16-medium text-text-strong">{language.t("settings.mcp.title")}</h2>
          <p class="text-14-regular text-text-weak">{language.t("settings.mcp.description")}</p>
        </div>
      </div>

      <div class="flex flex-col gap-8 max-w-[720px]">
        <div class="flex flex-col gap-1">
          <h3 class="text-14-medium text-text-strong pb-2">
            {language.t("settings.mcp.section.servers") ?? "MCP Servers"}
          </h3>
          <div class="bg-surface-raised-base px-4 rounded-lg">
            <Show
              when={mcpServers().length > 0}
              fallback={
                <div class="py-4 text-14-regular text-text-weak">
                  {language.t("settings.mcp.empty") ?? "No MCP servers configured"}
                </div>
              }
            >
              <For each={mcpServers()}>
                {(server) => (
                  <div class="group flex flex-wrap items-center justify-between gap-4 min-h-16 py-3 border-b border-border-weak-base last:border-none">
                    <div class="flex items-center gap-3 min-w-0">
                      <div class="size-2 rounded-full bg-text-weak" data-active={server.status === "connected"} />
                      <div class="flex flex-col gap-0.5 min-w-0">
                        <span class="text-14-medium text-text-strong truncate">{server.name}</span>
                        <div class="flex items-center gap-2">
                          <span class={`text-12-regular ${getStatusColor(server.status)}`}>
                            {getStatusLabel(server.status)}
                          </span>
                          <Show when={getError(server)}>
                            {(err) => (
                              <span class="text-11-regular text-text-error truncate max-w-[300px]" title={err()}>
                                {err()}
                              </span>
                            )}
                          </Show>
                        </div>
                      </div>
                    </div>
                    <div class="flex items-center gap-2">
                      <Show when={server.status === "needs_auth"}>
                        <Button size="small" variant="secondary" onClick={() => handleAuthenticate(server.name)}>
                          {language.t("mcp.action.authenticate") ?? "Authenticate"}
                        </Button>
                      </Show>
                      <Show when={server.status === "needs_client_registration"}>
                        <Button size="small" variant="ghost" disabled>
                          {language.t("mcp.action.configure") ?? "Configure"}
                        </Button>
                      </Show>
                      <Switch
                        checked={server.status === "connected"}
                        disabled={server.status === "needs_auth" || server.status === "needs_client_registration"}
                        onChange={() => toggleServer(server.name, server.status === "connected")}
                      />
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <h3 class="text-14-medium text-text-strong pb-2">
            {language.t("settings.mcp.section.about") ?? "About MCP"}
          </h3>
          <div class="bg-surface-raised-base px-4 rounded-lg p-4">
            <p class="text-13-regular text-text-weak">
              {language.t("settings.mcp.about.description") ??
                "Model Context Protocol (MCP) servers allow you to extend OpenCode's capabilities by connecting to external tools and services."}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
