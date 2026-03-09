import { Component, For, Show, createMemo } from "solid-js"
import { useLanguage } from "@/context/language"
import { useGlobalSync } from "@/context/global-sync"

export const SettingsCommands: Component = () => {
  const language = useLanguage()
  const globalSync = useGlobalSync()

  const commands = createMemo(() => globalSync.data.command ?? [])

  const getSourceLabel = (source?: string) => {
    switch (source) {
      case "command":
        return language.t("settings.commands.source.command") ?? "Custom"
      case "mcp":
        return language.t("settings.commands.source.mcp") ?? "MCP"
      case "skill":
        return language.t("settings.commands.source.skill") ?? "Skill"
      default:
        return language.t("settings.commands.source.unknown") ?? "Unknown"
    }
  }

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-1 pt-6 pb-8 max-w-[720px]">
          <h2 class="text-16-medium text-text-strong">{language.t("settings.commands.title")}</h2>
          <p class="text-14-regular text-text-weak">{language.t("settings.commands.description")}</p>
        </div>
      </div>

      <div class="flex flex-col gap-8 max-w-[720px]">
        <div class="flex flex-col gap-1">
          <h3 class="text-14-medium text-text-strong pb-2">
            {language.t("settings.commands.section.commands") ?? "Commands"}
          </h3>
          <div class="bg-surface-raised-base px-4 rounded-lg">
            <Show
              when={commands().length > 0}
              fallback={
                <div class="py-4 text-14-regular text-text-weak">
                  {language.t("settings.commands.empty") ?? "No commands configured"}
                </div>
              }
            >
              <For each={commands()}>
                {(cmd) => (
                  <div class="flex flex-wrap items-center justify-between gap-4 min-h-16 py-3 border-b border-border-weak-base last:border-none">
                    <div class="flex flex-col gap-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="text-14-medium text-text-strong">/{cmd.name}</span>
                        <Show when={cmd.source}>
                          <span class="text-11-regular px-1.5 py-0.5 rounded bg-surface-base text-text-weak">
                            {getSourceLabel(cmd.source)}
                          </span>
                        </Show>
                        <Show when={cmd.subtask}>
                          <span class="text-11-regular text-text-weaker">
                            {language.t("settings.commands.badge.subtask") ?? "Subtask"}
                          </span>
                        </Show>
                      </div>
                      <Show when={cmd.description}>
                        <span class="text-12-regular text-text-weak truncate">{cmd.description}</span>
                      </Show>
                      <Show when={cmd.model}>
                        <span class="text-11-regular text-text-weaker">
                          {language.t("settings.commands.usesModel") ?? "Model"}: {cmd.model}
                        </span>
                      </Show>
                      <Show when={cmd.agent}>
                        <span class="text-11-regular text-text-weaker">
                          {language.t("settings.commands.usesAgent") ?? "Agent"}: {cmd.agent}
                        </span>
                      </Show>
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <h3 class="text-14-medium text-text-strong pb-2">
            {language.t("settings.commands.section.about") ?? "About Commands"}
          </h3>
          <div class="bg-surface-raised-base px-4 rounded-lg p-4">
            <p class="text-13-regular text-text-weak">
              {language.t("settings.commands.about.description") ??
                "Commands allow you to define custom prompt templates that can be executed with /commandname. Use them to automate common tasks or create reusable prompts."}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
