import { Popover as Kobalte } from "@kobalte/core/popover"
import {
  Component,
  ComponentProps,
  createMemo,
  For,
  JSX,
  Show,
  ValidComponent,
  createSignal,
  onMount,
  onCleanup,
} from "solid-js"
import { createStore } from "solid-js/store"
import { useLocal, type ModelKey } from "@/context/local"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { popularProviders } from "@/hooks/use-providers"
import { Button } from "@opencode-ai/ui/button"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tag } from "@opencode-ai/ui/tag"
import { Checkbox } from "@opencode-ai/ui/checkbox"
import { Dialog } from "@opencode-ai/ui/dialog"
import { List } from "@opencode-ai/ui/list"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { DialogSelectProvider } from "./dialog-select-provider"
import { DialogManageModels } from "./dialog-manage-models"
import { ModelTooltip } from "./model-tooltip"
import { useLanguage } from "@/context/language"

const MAX_COLLABORATIVE_MODELS = 3

const isFree = (provider: string, cost: { input: number } | undefined) =>
  provider === "opencode" && (!cost || cost.input === 0)

const ModelList: Component<{
  provider?: string
  class?: string
  onSelect: () => void
  action?: JSX.Element
  multiSelect?: boolean
  selected?: ModelKey[]
  onMultiSelect?: (model: ModelKey, selected: boolean) => void
  lastSelectedIndex?: number
  onLastSelectedIndexChange?: (index: number) => void
}> = (props) => {
  const local = useLocal()
  const language = useLanguage()
  const [shiftHeld, setShiftHeld] = createSignal(false)

  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(true)
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(false)
    }
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    onCleanup(() => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    })
  })

  const models = createMemo(() =>
    local.model
      .list()
      .filter((m) => local.model.visible({ modelID: m.id, providerID: m.provider.id }))
      .filter((m) => (props.provider ? m.provider.id === props.provider : true)),
  )

  const isSelected = (modelKey: ModelKey) => {
    return props.selected?.some((m) => m.modelID === modelKey.modelID && m.providerID === modelKey.providerID)
  }

  const handleSelect = (x: any, index: number) => {
    if (props.multiSelect && props.onMultiSelect && x) {
      if (shiftHeld() && props.lastSelectedIndex !== undefined && props.lastSelectedIndex >= 0) {
        const start = Math.min(props.lastSelectedIndex, index)
        const end = Math.max(props.lastSelectedIndex, index)
        const range = models().slice(start, end + 1)

        for (const model of range) {
          const modelKey = { modelID: model.id, providerID: model.provider.id }
          if (!isSelected(modelKey) && props.selected!.length < MAX_COLLABORATIVE_MODELS) {
            props.onMultiSelect(modelKey, true)
          }
        }
      } else {
        const modelKey = { modelID: x.id, providerID: x.provider.id }
        const selected = isSelected(modelKey)
        props.onMultiSelect(modelKey, !selected)
      }

      props.onLastSelectedIndexChange?.(index)
    } else {
      if (x) {
        local.model.set(x ? { modelID: x.id, providerID: x.provider.id } : undefined, {
          recent: true,
        })
      }
      props.onSelect()
    }
  }

  return (
    <List
      class={`flex-1 min-h-0 [&_[data-slot=list-scroll]]:flex-1 [&_[data-slot=list-scroll]]:min-h-0 ${props.class ?? ""}`}
      search={{ placeholder: language.t("dialog.model.search.placeholder"), autofocus: true, action: props.action }}
      emptyMessage={language.t("dialog.model.empty")}
      key={(x) => `${x.provider.id}:${x.id}`}
      items={models}
      current={local.model.current()}
      filterKeys={["provider.name", "name", "id"]}
      sortBy={(a, b) => a.name.localeCompare(b.name)}
      groupBy={(x) => x.provider.name}
      sortGroupsBy={(a, b) => {
        const aProvider = a.items[0].provider.id
        const bProvider = b.items[0].provider.id
        if (popularProviders.includes(aProvider) && !popularProviders.includes(bProvider)) return -1
        if (!popularProviders.includes(aProvider) && popularProviders.includes(bProvider)) return 1
        return popularProviders.indexOf(aProvider) - popularProviders.indexOf(bProvider)
      }}
      itemWrapper={(item, node) => (
        <Tooltip
          class="w-full"
          placement="right-start"
          gutter={12}
          value={<ModelTooltip model={item} latest={item.latest} free={isFree(item.provider.id, item.cost)} />}
        >
          {node}
        </Tooltip>
      )}
      onSelect={(x, index) => handleSelect(x, index)}
    >
      {(i) => {
        const modelKey = () => ({ modelID: i.id, providerID: i.provider.id })
        return (
          <div class="w-full flex items-center gap-x-2 text-13-regular">
            <Show when={props.multiSelect}>
              <Checkbox
                checked={isSelected(modelKey())}
                onChange={(checked) => {
                  props.onMultiSelect?.(modelKey(), checked)
                }}
                onClick={(e: MouseEvent) => e.stopPropagation()}
              />
            </Show>
            <span class="truncate">{i.name}</span>
            <Show when={isFree(i.provider.id, i.cost)}>
              <Tag>{language.t("model.tag.free")}</Tag>
            </Show>
            <Show when={i.latest}>
              <Tag>{language.t("model.tag.latest")}</Tag>
            </Show>
          </div>
        )
      }}
    </List>
  )
}

type ModelSelectorTriggerProps = Omit<ComponentProps<typeof Kobalte.Trigger>, "as" | "ref">

export function ModelSelectorPopover(props: {
  provider?: string
  children?: JSX.Element
  triggerAs?: ValidComponent
  triggerProps?: ModelSelectorTriggerProps
}) {
  const [store, setStore] = createStore<{
    open: boolean
    dismiss: "escape" | "outside" | null
  }>({
    open: false,
    dismiss: null,
  })
  const dialog = useDialog()
  const local = useLocal()

  const [multiSelect, setMultiSelect] = createStore<{
    enabled: boolean
    selected: ModelKey[]
    lastSelectedIndex: number
  }>({
    enabled: false,
    selected: [],
    lastSelectedIndex: -1,
  })

  const handleManage = () => {
    setStore("open", false)
    dialog.show(() => <DialogManageModels />)
  }

  const handleConnectProvider = () => {
    setStore("open", false)
    dialog.show(() => <DialogSelectProvider />)
  }

  const handleMultiSelectChange = (model: ModelKey, selected: boolean) => {
    if (selected) {
      if (multiSelect.selected.length < MAX_COLLABORATIVE_MODELS) {
        setMultiSelect("selected", [...multiSelect.selected, model])
      }
    } else {
      setMultiSelect(
        "selected",
        multiSelect.selected.filter((m) => !(m.modelID === model.modelID && m.providerID === model.providerID)),
      )
    }
  }

  const toggleCollaborative = () => {
    const newEnabled = !multiSelect.enabled
    setMultiSelect("enabled", newEnabled)
    if (!newEnabled) {
      setMultiSelect("selected", [])
      setMultiSelect("lastSelectedIndex", -1)
    }
  }

  const applySelection = () => {
    if (multiSelect.selected.length > 0) {
      local.model.setCollaborative(multiSelect.selected)
    }
    setStore("open", false)
  }

  const language = useLanguage()

  return (
    <Kobalte
      open={store.open}
      onOpenChange={(next) => {
        if (next) {
          setMultiSelect("selected", local.model.collaborative())
          setStore("dismiss", null)
        }
        setStore("open", next)
      }}
      modal={false}
      placement="top-start"
      gutter={4}
    >
      <Kobalte.Trigger as={props.triggerAs ?? "div"} {...props.triggerProps}>
        {props.children}
      </Kobalte.Trigger>
      <Kobalte.Portal>
        <Kobalte.Content
          class="w-80 flex flex-col p-2 rounded-md border border-border-base bg-surface-raised-stronger-non-alpha shadow-md z-50 outline-none overflow-hidden"
          onEscapeKeyDown={(event) => {
            setStore("dismiss", "escape")
            setStore("open", false)
            event.preventDefault()
            event.stopPropagation()
          }}
          onPointerDownOutside={() => {
            setStore("dismiss", "outside")
            setStore("open", false)
          }}
          onFocusOutside={() => {
            setStore("dismiss", "outside")
            setStore("open", false)
          }}
          onCloseAutoFocus={(event) => {
            if (store.dismiss === "outside") event.preventDefault()
            setStore("dismiss", null)
          }}
        >
          <Kobalte.Title class="sr-only">{language.t("dialog.model.select.title")}</Kobalte.Title>
          <div class="flex items-center justify-between px-2 py-1.5 border-b border-border-base mb-1">
            <span class="text-13-medium">{language.t("dialog.model.select.title")}</span>
            <Button
              variant={multiSelect.enabled ? "primary" : "ghost"}
              size="small"
              class="text-11-medium h-6"
              onClick={toggleCollaborative}
            >
              {language.t("dialog.model.collaborate")} ({multiSelect.selected.length}/{MAX_COLLABORATIVE_MODELS})
            </Button>
          </div>
          <Show when={multiSelect.enabled && multiSelect.selected.length > 0}>
            <div class="flex flex-wrap gap-1 px-2 py-1.5 bg-surface-base rounded-xs mx-1 mb-1">
              <For each={multiSelect.selected}>
                {(model) => {
                  const modelInfo = local.model.find(model)
                  return (
                    <Tag class="bg-surface-raised-stronger">
                      {modelInfo?.name ?? model.modelID}
                      <button class="ml-1 hover:text-text-error" onClick={() => handleMultiSelectChange(model, false)}>
                        ×
                      </button>
                    </Tag>
                  )
                }}
              </For>
            </div>
          </Show>
          <ModelList
            provider={props.provider}
            onSelect={() => setStore("open", false)}
            class="p-1"
            multiSelect={multiSelect.enabled}
            selected={multiSelect.selected}
            onMultiSelect={handleMultiSelectChange}
            lastSelectedIndex={multiSelect.lastSelectedIndex}
            onLastSelectedIndexChange={(index) => setMultiSelect("lastSelectedIndex", index)}
            action={
              <div class="flex items-center gap-1">
                <Tooltip placement="top" value={language.t("command.provider.connect")}>
                  <IconButton
                    icon="plus-small"
                    variant="ghost"
                    iconSize="normal"
                    class="size-6"
                    aria-label={language.t("command.provider.connect")}
                    onClick={handleConnectProvider}
                  />
                </Tooltip>
                <Tooltip placement="top" value={language.t("dialog.model.manage")}>
                  <IconButton
                    icon="sliders"
                    variant="ghost"
                    iconSize="normal"
                    class="size-6"
                    aria-label={language.t("dialog.model.manage")}
                    onClick={handleManage}
                  />
                </Tooltip>
              </div>
            }
          />
          <Show when={multiSelect.enabled}>
            <div class="flex justify-end gap-2 px-2 pt-2 border-t border-border-base">
              <Button variant="ghost" size="small" onClick={() => setStore("open", false)}>
                {language.t("common.cancel")}
              </Button>
              <Button
                variant="primary"
                size="small"
                disabled={multiSelect.selected.length === 0}
                onClick={applySelection}
              >
                {language.t("dialog.model.apply")}
              </Button>
            </div>
          </Show>
        </Kobalte.Content>
      </Kobalte.Portal>
    </Kobalte>
  )
}

export const DialogSelectModel: Component<{ provider?: string }> = (props) => {
  const dialog = useDialog()
  const language = useLanguage()

  return (
    <Dialog
      title={language.t("dialog.model.select.title")}
      action={
        <Button
          class="h-7 -my-1 text-14-medium"
          icon="plus-small"
          tabIndex={-1}
          onClick={() => dialog.show(() => <DialogSelectProvider />)}
        >
          {language.t("command.provider.connect")}
        </Button>
      }
    >
      <ModelList provider={props.provider} onSelect={() => dialog.close()} />
      <Button
        variant="ghost"
        class="ml-3 mt-5 mb-6 text-text-base self-start"
        onClick={() => dialog.show(() => <DialogManageModels />)}
      >
        {language.t("dialog.model.manage")}
      </Button>
    </Dialog>
  )
}
