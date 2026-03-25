import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { TextField } from "@opencode-ai/ui/text-field"
import { showToast } from "@opencode-ai/ui/toast"
import { createEffect, createMemo, For, Show, type Component } from "solid-js"
import { createStore } from "solid-js/store"
import { useGlobalSDK } from "@/context/global-sdk"
import { useLanguage } from "@/context/language"
import type { Command } from "@opencode-ai/sdk/v2/client"
import { DialogEditCommand } from "./dialog-edit-command"

type CommandConfig = {
  template: string
  description?: string
  agent?: string
  model?: string
  subtask?: boolean
}

export const SettingsCommands: Component = () => {
  const dialog = useDialog()
  const language = useLanguage()
  const sdk = useGlobalSDK()

  const [store, setStore] = createStore({
    path: "",
    loading: true,
    busy: null as string | null,
    globalItems: [] as Array<{ name: string; config: CommandConfig }>,
    allCommands: [] as Command[],
  })

  const otherCommands = createMemo(() => {
    const globalNames = new Set(store.globalItems.map((i) => i.name))
    return store.allCommands.filter((cmd) => !globalNames.has(cmd.name))
  })

  const load = async () => {
    setStore("loading", true)
    try {
      const [configResult, listResult] = await Promise.all([
        sdk.client.command.config.list(),
        sdk.client.command.list(),
      ])
      setStore("path", configResult.data?.path ?? "")
      setStore(
        "globalItems",
        Object.entries(configResult.data?.command ?? {})
          .map(([name, config]) => ({ name, config }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      )
      setStore(
        "allCommands",
        (listResult.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
      )
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setStore("loading", false)
    }
  }

  const openCreate = () => {
    dialog.show(() => <DialogEditCommand onSaved={load} />)
  }

  const openEdit = (item: { name: string; config: CommandConfig }) => {
    dialog.show(() => <DialogEditCommand name={item.name} config={item.config} onSaved={load} />)
  }

  const remove = async (name: string) => {
    if (store.busy) return
    if (!confirm(language.t("settings.commands.delete.confirm", { name }))) return
    setStore("busy", name)
    try {
      await sdk.client.command.config.delete({ name })
      await load()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("settings.commands.toast.deleted"),
      })
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setStore("busy", null)
    }
  }

  const sourceLabel = (cmd: Command) => {
    if (!cmd.source) return language.t("settings.commands.source.builtin")
    return language.t(`settings.commands.source.${cmd.source}` as any)
  }

  createEffect(() => {
    void load()
  })

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-raised-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-4 pt-6 pb-8 max-w-[720px]">
          <div class="flex items-start justify-between gap-4">
            <div class="flex flex-col gap-1">
              <h2 class="text-16-medium text-text-strong">{language.t("settings.commands.title")}</h2>
              <p class="text-14-regular text-text-weak">{language.t("settings.commands.description")}</p>
            </div>
            <Button size="large" variant="secondary" icon="plus-small" onClick={openCreate}>
              {language.t("settings.commands.action.add")}
            </Button>
          </div>
        </div>
      </div>

      <Show
        when={!store.loading}
        fallback={
          <div class="py-4 text-14-regular text-text-weak max-w-[720px]">
            {language.t("common.loading")}
            {language.t("common.loading.ellipsis")}
          </div>
        }
      >
        <div class="flex flex-col gap-8 max-w-[720px]">
          {/* Global config commands - editable */}
          <div class="flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <span class="text-13-medium text-text-weak">{language.t("settings.commands.section.global")}</span>
              <TextField readOnly copyable value={store.path} class="font-mono max-w-[400px]" />
            </div>
            <div class="bg-surface-raised-base px-4 rounded-lg">
              <Show
                when={store.globalItems.length > 0}
                fallback={<div class="py-4 text-14-regular text-text-weak">{language.t("settings.commands.empty")}</div>}
              >
                <For each={store.globalItems}>
                  {(item) => (
                    <div class="flex flex-wrap items-center justify-between gap-4 min-h-16 py-3 border-b border-border-weak-base last:border-none">
                      <div class="flex flex-col min-w-0 gap-1">
                        <span class="text-14-medium text-text-strong truncate">/{item.name}</span>
                        <Show when={item.config.description}>
                          <span class="text-12-regular text-text-weak truncate">{item.config.description}</span>
                        </Show>
                        <span class="text-12-regular text-text-weaker truncate max-w-[400px]">
                          {item.config.template.length > 80
                            ? item.config.template.slice(0, 80) + "..."
                            : item.config.template}
                        </span>
                      </div>
                      <div class="flex items-center gap-1">
                        <Button size="large" variant="ghost" disabled={!!store.busy} onClick={() => openEdit(item)}>
                          {language.t("common.edit")}
                        </Button>
                        <Button size="large" variant="ghost" disabled={!!store.busy} onClick={() => void remove(item.name)}>
                          {language.t("common.delete")}
                        </Button>
                      </div>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </div>

          {/* All other runtime commands - read-only */}
          <Show when={otherCommands().length > 0}>
            <div class="flex flex-col gap-3">
              <span class="text-13-medium text-text-weak">{language.t("settings.commands.section.all")}</span>
              <div class="bg-surface-raised-base px-4 rounded-lg">
                <For each={otherCommands()}>
                  {(cmd) => (
                    <div class="flex flex-wrap items-center justify-between gap-4 min-h-14 py-3 border-b border-border-weak-base last:border-none">
                      <div class="flex flex-col min-w-0 gap-1">
                        <div class="flex items-center gap-2">
                          <span class="text-14-medium text-text-strong truncate">/{cmd.name}</span>
                          <span class="text-11-regular text-text-weaker px-1.5 py-0.5 rounded bg-surface-base">
                            {sourceLabel(cmd)}
                          </span>
                        </div>
                        <Show when={cmd.description}>
                          <span class="text-12-regular text-text-weak truncate">{cmd.description}</span>
                        </Show>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}
