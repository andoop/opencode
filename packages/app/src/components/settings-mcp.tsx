import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Icon } from "@opencode-ai/ui/icon"
import { Select } from "@opencode-ai/ui/select"
import { TextField } from "@opencode-ai/ui/text-field"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { showToast } from "@opencode-ai/ui/toast"
import { useParams } from "@solidjs/router"
import type {
  McpConfigToolsListResponses,
  McpRemoteConfig,
  PermissionActionConfig,
} from "@opencode-ai/sdk/v2/client"

type McpToolRule = NonNullable<McpConfigToolsListResponses[200]["tools"][string]>[number]
import { createEffect, createMemo, For, Show, type Component } from "solid-js"
import { createStore } from "solid-js/store"
import { useAuth } from "@/context/auth"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { decode64 } from "@/utils/base64"
import { DialogEditMcp } from "./dialog-edit-mcp"

const ACTIONS = [
  { value: "allow" as const, label: "settings.permissions.action.allow" },
  { value: "ask" as const, label: "settings.permissions.action.ask" },
  { value: "deny" as const, label: "settings.permissions.action.deny" },
] as const

export const SettingsMcp: Component = () => {
  const auth = useAuth()
  const dialog = useDialog()
  const params = useParams()
  const language = useLanguage()
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()

  const directory = createMemo(() => decode64(params.dir) ?? globalSync.data.path.directory ?? "")
  const child = createMemo(() => (directory() ? globalSync.child(directory()) : undefined))
  const sync = createMemo(() => child()?.[0])
  const setSync = () => child()?.[1]

  const [store, setStore] = createStore({
    scope: "project" as "project" | "global",
    path: "",
    loading: true,
    busy: null as string | null,
    refreshing: null as string | null,
    items: [] as Array<{ name: string; config: McpRemoteConfig }>,
    tools: {} as Record<string, McpToolRule[]>,
    expanded: {} as Record<string, boolean>,
  })

  const scopes = createMemo(() => {
    const items: Array<{ value: "project" | "global"; label: string }> = [
      { value: "project", label: language.t("settings.mcp.scope.project") },
    ]
    if (auth.isAdmin) items.push({ value: "global" as const, label: language.t("settings.mcp.scope.global") })
    return items
  })

  const actions = createMemo(() =>
    ACTIONS.map((item) => ({
      value: item.value,
      label: language.t(item.label),
    })),
  )

  const refreshStatus = async () => {
    if (!directory()) return
    const result = await globalSDK.client.mcp.status({ directory: directory() })
    if (result.data) setSync()?.("mcp", result.data)
  }

  const load = async () => {
    if (!directory() && store.scope === "project") {
      setStore("path", "")
      setStore("items", [])
      setStore("loading", false)
      return
    }
    setStore("loading", true)
    try {
      const [result, toolsResult] = await Promise.all([
        globalSDK.client.mcp.config.list({ scope: store.scope, directory: directory() || undefined }),
        globalSDK.client.mcp.config.tools.list({ scope: store.scope, directory: directory() || undefined }),
      ])
      const data = result.data
      setStore("path", data?.path ?? toolsResult.data?.path ?? "")
      setStore(
        "items",
        Object.entries(data?.mcp ?? {})
          .map(([name, config]) => ({ name, config }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      )
      setStore("tools", toolsResult.data?.tools ?? {})
      setStore(
        "expanded",
        Object.fromEntries(
          Object.keys(data?.mcp ?? {}).map((name) => [name, store.expanded[name] ?? false]),
        ),
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

  const refresh = async () => {
    await load()
    await refreshStatus().catch(() => undefined)
  }

  const refreshAll = async () => {
    if (store.refreshing) return
    setStore("refreshing", "all")
    try {
      await refresh()
    } finally {
      setStore("refreshing", null)
    }
  }

  const openCreate = () => {
    dialog.show(() => <DialogEditMcp scope={store.scope} directory={directory()} onSaved={refresh} />)
  }

  const openEdit = (item: { name: string; config: McpRemoteConfig }) => {
    dialog.show(() => (
      <DialogEditMcp scope={store.scope} directory={directory()} name={item.name} config={item.config} onSaved={refresh} />
    ))
  }

  const toggle = async (name: string) => {
    if (store.busy || store.refreshing) return
    setStore("busy", name)
    try {
      const status = sync()?.mcp[name]
      await (status?.status === "connected"
        ? globalSDK.client.mcp.disconnect({ name, directory: directory() || undefined })
        : globalSDK.client.mcp.connect({ name, directory: directory() || undefined }))
      await refreshStatus()
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

  const remove = async (name: string) => {
    if (store.busy || store.refreshing) return
    if (!confirm(language.t("settings.mcp.delete.confirm", { name }))) return
    setStore("busy", name)
    try {
      await globalSDK.client.mcp.config.delete({ scope: store.scope, name, directory: directory() || undefined })
      await refresh()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("settings.mcp.toast.deleted"),
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

  const statusLabel = (name: string) => {
    const value = sync()?.mcp[name]?.status
    if (!value) return language.t("settings.mcp.status.unknown")
    if (value === "connected") return language.t("mcp.status.connected")
    if (value === "failed") return language.t("mcp.status.failed")
    if (value === "needs_auth") return language.t("mcp.status.needs_auth")
    if (value === "disabled") return language.t("mcp.status.disabled")
    return language.t("mcp.status.needs_client_registration")
  }

  const setToolAction = async (id: string, action: PermissionActionConfig) => {
    if (store.busy || store.refreshing) return
    setStore("busy", id)
    try {
      const result = await globalSDK.client.mcp.config.tools.update({
        id,
        action,
        scope: store.scope,
        directory: directory() || undefined,
      })
      setStore("tools", result.data?.tools ?? {})
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("settings.mcp.tools.toast.updated"),
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

  const refreshServer = async (name: string) => {
    if (store.busy || store.refreshing) return
    setStore("refreshing", name)
    try {
      const status = sync()?.mcp[name]?.status
      if (status && status !== "disabled") {
        await globalSDK.client.mcp.connect({ name, directory: directory() || undefined })
      }
      await refresh()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t("settings.mcp.toast.refreshed"),
      })
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setStore("refreshing", null)
    }
  }

  createEffect(() => {
    const next = store.scope
    if (next === "global" && !auth.isAdmin) {
      setStore("scope", "project")
      return
    }
    void load()
  })

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-10 sm:pb-10">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-raised-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-4 pt-6 pb-8 max-w-[720px]">
          <div class="flex items-start justify-between gap-4">
            <div class="flex flex-col gap-1">
              <h2 class="text-16-medium text-text-strong">{language.t("settings.mcp.title")}</h2>
              <p class="text-14-regular text-text-weak">{language.t("settings.mcp.description")}</p>
            </div>
            <div class="flex items-center gap-2">
              <Button size="large" variant="ghost" disabled={!!store.refreshing} onClick={() => void refreshAll()}>
                {store.refreshing === "all" ? language.t("settings.mcp.action.refreshing") : language.t("settings.mcp.action.refresh")}
              </Button>
              <Button size="large" variant="secondary" icon="plus-small" onClick={openCreate}>
                {language.t("settings.mcp.action.add")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-8 max-w-[720px]">
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-4 flex-wrap">
            <div class="flex items-center gap-3">
              <span class="text-12-medium text-text-weak">{language.t("settings.mcp.scope.label")}</span>
              <Select
                options={scopes()}
                current={scopes().find((item) => item.value === store.scope)}
                value={(item) => item.value}
                label={(item) => item.label}
                onSelect={(item) => item && setStore("scope", item.value)}
                variant="secondary"
                size="small"
                triggerVariant="settings"
              />
            </div>
          </div>

          <TextField
            readOnly
            copyable
            label={language.t("settings.mcp.path")}
            value={store.path}
            class="font-mono"
          />
        </div>

        <div class="bg-surface-raised-base px-4 rounded-lg">
          <Show
            when={!store.loading}
            fallback={
              <div class="py-4 text-14-regular text-text-weak">
                {language.t("common.loading")}
                {language.t("common.loading.ellipsis")}
              </div>
            }
          >
            <Show
              when={store.items.length > 0}
              fallback={<div class="py-4 text-14-regular text-text-weak">{language.t("settings.mcp.empty")}</div>}
            >
              <For each={store.items}>
                {(item) => (
                  <div class="flex flex-wrap items-center justify-between gap-4 min-h-16 py-3 border-b border-border-weak-base last:border-none">
                    <div class="flex flex-col min-w-0 gap-1">
                      <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-14-medium text-text-strong truncate">{item.name}</span>
                        <span class="text-11-regular text-text-weaker">{statusLabel(item.name)}</span>
                        <Show when={item.config.enabled === false}>
                          <span class="text-11-regular text-text-weaker">{language.t("settings.mcp.state.disabled")}</span>
                        </Show>
                      </div>
                      <span class="text-12-regular text-text-weak truncate">{item.config.url}</span>
                      <button
                        type="button"
                        class="mt-2 flex items-center gap-2 self-start text-12-medium text-text-weak hover:text-text-strong transition-colors"
                        onClick={() => setStore("expanded", item.name, (value) => !value)}
                      >
                        <span class="inline-flex items-center justify-center size-4 text-icon-weak">
                          <Icon name={store.expanded[item.name] ? "chevron-down" : "chevron-right"} size="small" />
                        </span>
                        <span>
                          {language.t("settings.mcp.tools.title")}
                          {store.tools[item.name]?.length ? ` (${store.tools[item.name].length})` : ""}
                        </span>
                      </button>
                      <Show when={store.expanded[item.name]}>
                        <Show
                          when={sync()?.mcp[item.name]?.status === "connected"}
                          fallback={
                            <span class="mt-1 text-12-regular text-text-weaker">
                              {language.t("settings.mcp.tools.disconnected")}
                            </span>
                          }
                        >
                          <Show
                            when={(store.tools[item.name] ?? []).length > 0}
                            fallback={
                              <span class="mt-1 text-12-regular text-text-weaker">{language.t("settings.mcp.tools.empty")}</span>
                            }
                          >
                            <div class="flex flex-col gap-2 mt-2">
                              <For each={store.tools[item.name] ?? []}>
                                {(tool) => (
                                  <div class="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-base px-3 py-2">
                                    <Tooltip
                                      openDelay={700}
                                      placement="top-start"
                                      inactive={!tool.description}
                                      value={
                                        <div class="max-w-[360px] whitespace-normal break-words">
                                          <div class="text-12-medium text-text-invert-base">{tool.name}</div>
                                          <Show when={tool.description}>
                                            <div class="mt-1 text-12-regular text-text-invert-base">{tool.description}</div>
                                          </Show>
                                        </div>
                                      }
                                    >
                                      <div class="flex flex-col min-w-0 gap-0.5 flex-1">
                                        <span class="text-13-medium text-text-strong truncate">{tool.name}</span>
                                        <Show when={tool.description}>
                                          <span class="text-12-regular text-text-weak whitespace-normal break-words">
                                            {tool.description}
                                          </span>
                                        </Show>
                                      </div>
                                    </Tooltip>
                                    <Select
                                      options={actions()}
                                      current={actions().find((option) => option.value === tool.action)}
                                      value={(option) => option.value}
                                      label={(option) => option.label}
                                      onSelect={(option) => option && void setToolAction(tool.id, option.value)}
                                      disabled={!!store.busy || !!store.refreshing}
                                      variant="secondary"
                                      size="small"
                                      triggerVariant="settings"
                                    />
                                  </div>
                                )}
                              </For>
                            </div>
                          </Show>
                        </Show>
                      </Show>
                    </div>
                    <div class="flex items-center gap-1 flex-wrap">
                      <Button
                        size="large"
                        variant="ghost"
                        disabled={!!store.busy || !!store.refreshing}
                        onClick={() => void refreshServer(item.name)}
                      >
                        {store.refreshing === item.name
                          ? language.t("settings.mcp.action.refreshing")
                          : language.t("settings.mcp.action.refresh")}
                      </Button>
                      <Button
                        size="large"
                        variant="ghost"
                        disabled={!!store.busy || !!store.refreshing}
                        onClick={() => void toggle(item.name)}
                      >
                        {sync()?.mcp[item.name]?.status === "connected"
                          ? language.t("common.disconnect")
                          : language.t("common.connect")}
                      </Button>
                      <Button
                        size="large"
                        variant="ghost"
                        disabled={!!store.busy || !!store.refreshing}
                        onClick={() => openEdit(item)}
                      >
                        {language.t("common.edit")}
                      </Button>
                      <Button
                        size="large"
                        variant="ghost"
                        disabled={!!store.busy || !!store.refreshing}
                        onClick={() => void remove(item.name)}
                      >
                        {language.t("common.delete")}
                      </Button>
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </Show>
        </div>
      </div>
    </div>
  )
}
