import { Button } from "@opencode-ai/ui/button"
import { For, Show, createMemo, createResource } from "solid-js"
import { createStore } from "solid-js/store"
import {
  type StorageCategory,
  type StorageCleanupResult,
  type StoragePlan,
  type StorageSummary,
  useAdminCommon,
} from "./shared"
import { type WorkspaceInfo, workspaceFetch } from "@/utils/workspace-api"

type SessionInfo = {
  id: string
  time?: {
    archived?: number
  }
}

const categories: StorageCategory[] = [
  "workspaces",
  "closedWorkspaces",
  "snapshots",
  "cache",
  "tmpUploads",
  "archivedSessions",
  "orphanWorkspaces",
  "orphanUserWorktrees",
  "danglingStorage",
]

export default function AdminStoragePage() {
  const { auth, authHeaders, fetchFn, language, readError, server } = useAdminCommon()
  const [state, setState] = createStore({
    selected: Object.fromEntries(categories.map((category) => [category, true])) as Record<StorageCategory, boolean>,
    force: false,
    planning: false,
    cleaning: false,
    userID: "",
    error: undefined as string | undefined,
    plan: undefined as StoragePlan | undefined,
    result: undefined as StorageCleanupResult | undefined,
  })

  const activeState = async () => {
    const open = new Set(server.projects.list().map((item) => item.worktree))
    const workspaces = await workspaceFetch<WorkspaceInfo[]>(server.url, "/workspace", {
      token: auth.token ?? undefined,
      fetchFn,
    }).catch(() => [] as WorkspaceInfo[])
    const active = workspaces.filter((item) => open.has(item.directory))
    const sessions = (
      await Promise.all(
        active.map((item) =>
          workspaceFetch<SessionInfo[]>(server.url, `/session?directory=${encodeURIComponent(item.directory)}`, {
            token: auth.token ?? undefined,
            fetchFn,
          }).catch(() => [] as SessionInfo[]),
        ),
      )
    ).flat()
    return {
      activeWorkspaceIDs: active.map((item) => item.id),
      activeSessionIDs: sessions.filter((item) => !item.time?.archived).map((item) => item.id),
    }
  }

  const fetchSummary = async () => {
    const response = await fetchFn(`${server.url}/storage/admin/summary`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(await activeState()),
    })
    if (!response.ok) throw new Error(await readError(response, language.t("admin.storage.error.loadFailed")))
    return response.json() as Promise<StorageSummary>
  }

  const [summary, { refetch }] = createResource(fetchSummary)
  const selectedCategories = createMemo(() => categories.filter((category) => state.selected[category]))

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    const units = ["KB", "MB", "GB", "TB"]
    const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length)
    const value = bytes / Math.pow(1024, exp)
    return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[exp - 1]}`
  }

  const categoryLabel = (category: StorageCategory) => language.t(`admin.storage.category.${category}` as const)
  const riskLabel = (risk: "low" | "medium" | "high") => language.t(`admin.storage.risk.${risk}` as const)
  const itemOwner = (item: { metadata: Record<string, string> }) =>
    item.metadata.userID ?? item.metadata.owner ?? "__unknown__"
  const visibleItems = createMemo(() =>
    (summary()?.items ?? []).filter((item) => !state.userID || itemOwner(item) === state.userID),
  )
  const userLabel = (userID: string, username?: string) => {
    if (userID === "__global__") return language.t("admin.storage.user.global")
    if (userID === "__unknown__") return language.t("admin.storage.user.unknown")
    if (userID === "__local__") return language.t("admin.storage.user.local")
    return username ? `${username} (${userID})` : userID
  }

  const post = async <T,>(path: string) => {
    const response = await fetchFn(`${server.url}${path}`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        categories: selectedCategories(),
        ...(await activeState()),
        userID: state.userID || undefined,
        force: state.force,
      }),
    })
    if (!response.ok) throw new Error(await readError(response, language.t("admin.storage.error.requestFailed")))
    return response.json() as Promise<T>
  }

  const planCleanup = async () => {
    setState({ planning: true, error: undefined, result: undefined })
    try {
      setState({ plan: await post<StoragePlan>("/storage/admin/plan") })
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      setState({ planning: false })
    }
  }

  const runCleanup = async () => {
    const plan = state.plan
    if (!plan) return
    const message = language
      .t("admin.storage.confirmCleanup")
      .replace("{{count}}", String(plan.items.length))
      .replace("{{bytes}}", formatBytes(plan.total_bytes))
    if (!window.confirm(message)) return
    setState({ cleaning: true, error: undefined })
    try {
      setState({ result: await post<StorageCleanupResult>("/storage/admin/cleanup") })
      setState({ plan: undefined })
      await refetch()
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      setState({ cleaning: false })
    }
  }

  return (
    <section class="space-y-6">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-semibold text-color-primary">{language.t("admin.storage.title")}</h2>
          <p class="mt-1 text-sm text-color-secondary">{language.t("admin.storage.description")}</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            void refetch()
          }}
        >
          {language.t("admin.storage.refresh")}
        </Button>
      </div>

      <Show when={summary.loading}>
        <p class="text-color-secondary">{language.t("admin.storage.loading")}</p>
      </Show>

      <Show when={summary.error}>
        <p class="text-auxiliary-error">{language.t("admin.storage.error.loadFailed")}</p>
      </Show>

      <Show when={state.error}>
        {(error) => <p class="rounded border border-auxiliary-error/30 p-3 text-sm text-auxiliary-error">{error()}</p>}
      </Show>

      <Show when={summary()}>
        {(data) => (
          <>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div class="rounded-lg border border-outline-dimmed p-4">
                <div class="text-xs text-color-secondary">{language.t("admin.storage.summary.total")}</div>
                <div class="mt-2 text-2xl font-semibold text-color-primary">{formatBytes(data().total_bytes)}</div>
              </div>
              <div class="rounded-lg border border-outline-dimmed p-4">
                <div class="text-xs text-color-secondary">{language.t("admin.storage.summary.reclaimable")}</div>
                <div class="mt-2 text-2xl font-semibold text-color-primary">
                  {formatBytes(data().reclaimable_bytes)}
                </div>
              </div>
              <div class="rounded-lg border border-outline-dimmed p-4">
                <div class="text-xs text-color-secondary">{language.t("admin.storage.summary.items")}</div>
                <div class="mt-2 text-2xl font-semibold text-color-primary">{visibleItems().length}</div>
              </div>
              <div class="rounded-lg border border-outline-dimmed p-4">
                <div class="text-xs text-color-secondary">{language.t("admin.storage.summary.highRisk")}</div>
                <div class="mt-2 text-2xl font-semibold text-color-primary">{data().high_risk}</div>
              </div>
            </div>

            <div class="rounded-lg border border-outline-dimmed">
              <div class="border-b border-outline-dimmed p-4">
                <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 class="font-medium text-color-primary">{language.t("admin.storage.users.title")}</h3>
                    <p class="mt-1 text-sm text-color-secondary">{language.t("admin.storage.users.description")}</p>
                  </div>
                  <select
                    value={state.userID}
                    onChange={(event) => setState({ userID: event.currentTarget.value, plan: undefined })}
                    class="rounded border border-outline-dimmed bg-background-input px-3 py-2 text-sm"
                  >
                    <option value="">{language.t("admin.storage.users.all")}</option>
                    <For each={data().users}>
                      {(user) => <option value={user.userID}>{userLabel(user.userID, user.username)}</option>}
                    </For>
                  </select>
                </div>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                  <thead class="border-b border-outline-dimmed text-xs uppercase text-color-secondary">
                    <tr>
                      <th class="px-4 py-3">{language.t("admin.storage.column.user")}</th>
                      <th class="px-4 py-3">{language.t("admin.storage.column.count")}</th>
                      <th class="px-4 py-3">{language.t("admin.storage.column.size")}</th>
                      <th class="px-4 py-3">{language.t("admin.storage.column.highRisk")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={data().users}>
                      {(user) => (
                        <tr class="border-b border-outline-dimmed last:border-0">
                          <td class="px-4 py-3 font-medium text-color-primary">
                            {userLabel(user.userID, user.username)}
                          </td>
                          <td class="px-4 py-3 text-color-secondary">{user.count}</td>
                          <td class="px-4 py-3 text-color-secondary">{formatBytes(user.bytes)}</td>
                          <td class="px-4 py-3 text-color-secondary">{user.high_risk}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="rounded-lg border border-outline-dimmed">
              <div class="border-b border-outline-dimmed p-4">
                <h3 class="font-medium text-color-primary">{language.t("admin.storage.categories.title")}</h3>
                <p class="mt-1 text-sm text-color-secondary">{language.t("admin.storage.categories.description")}</p>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-left text-sm">
                  <thead class="border-b border-outline-dimmed text-xs uppercase text-color-secondary">
                    <tr>
                      <th class="px-4 py-3">{language.t("admin.storage.column.select")}</th>
                      <th class="px-4 py-3">{language.t("admin.storage.column.category")}</th>
                      <th class="px-4 py-3">{language.t("admin.storage.column.count")}</th>
                      <th class="px-4 py-3">{language.t("admin.storage.column.size")}</th>
                      <th class="px-4 py-3">{language.t("admin.storage.column.reclaimable")}</th>
                      <th class="px-4 py-3">{language.t("admin.storage.column.highRisk")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={data().categories}>
                      {(row) => (
                        <tr class="border-b border-outline-dimmed last:border-0">
                          <td class="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={state.selected[row.category]}
                              onChange={(event) => setState("selected", row.category, event.currentTarget.checked)}
                            />
                          </td>
                          <td class="px-4 py-3 font-medium text-color-primary">{categoryLabel(row.category)}</td>
                          <td class="px-4 py-3 text-color-secondary">{row.count}</td>
                          <td class="px-4 py-3 text-color-secondary">{formatBytes(row.bytes)}</td>
                          <td class="px-4 py-3 text-color-secondary">{formatBytes(row.reclaimable)}</td>
                          <td class="px-4 py-3 text-color-secondary">{row.high_risk}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="rounded-lg border border-outline-dimmed p-4">
              <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <label class="flex items-center gap-2 text-sm text-color-primary">
                  <input
                    type="checkbox"
                    checked={state.force}
                    onChange={(event) => setState({ force: event.currentTarget.checked, plan: undefined })}
                  />
                  {language.t("admin.storage.force")}
                </label>
                <div class="flex gap-2">
                  <Button
                    variant="secondary"
                    disabled={selectedCategories().length === 0 || state.planning}
                    onClick={planCleanup}
                  >
                    {state.planning ? language.t("admin.storage.planning") : language.t("admin.storage.plan")}
                  </Button>
                  <Button
                    variant="primary"
                    disabled={!state.plan || state.plan.items.length === 0 || state.cleaning}
                    onClick={runCleanup}
                  >
                    {state.cleaning ? language.t("admin.storage.cleaning") : language.t("admin.storage.cleanup")}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </Show>

      <Show when={state.plan}>
        {(plan) => (
          <div class="rounded-lg border border-outline-dimmed">
            <div class="border-b border-outline-dimmed p-4">
              <h3 class="font-medium text-color-primary">{language.t("admin.storage.planTitle")}</h3>
              <p class="mt-1 text-sm text-color-secondary">
                {language
                  .t("admin.storage.planSummary")
                  .replace("{{count}}", String(plan().items.length))
                  .replace("{{bytes}}", formatBytes(plan().total_bytes))
                  .replace("{{skipped}}", String(plan().skipped.length))}
              </p>
            </div>
            <div class="max-h-96 overflow-auto">
              <table class="w-full text-left text-sm">
                <thead class="border-b border-outline-dimmed text-xs uppercase text-color-secondary">
                  <tr>
                    <th class="px-4 py-3">{language.t("admin.storage.column.category")}</th>
                    <th class="px-4 py-3">{language.t("admin.storage.column.user")}</th>
                    <th class="px-4 py-3">{language.t("admin.storage.column.object")}</th>
                    <th class="px-4 py-3">{language.t("admin.storage.column.size")}</th>
                    <th class="px-4 py-3">{language.t("admin.storage.column.risk")}</th>
                    <th class="px-4 py-3">{language.t("admin.storage.column.reason")}</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={plan().items.slice(0, 50)}>
                    {(item) => (
                      <tr class="border-b border-outline-dimmed last:border-0">
                        <td class="px-4 py-3 text-color-secondary">{categoryLabel(item.category)}</td>
                        <td class="px-4 py-3 text-color-secondary">{userLabel(itemOwner(item))}</td>
                        <td class="px-4 py-3 text-color-primary">
                          <div class="font-medium">{item.label}</div>
                          <div class="mt-1 max-w-xl truncate text-xs text-color-secondary">{item.paths[0]}</div>
                        </td>
                        <td class="px-4 py-3 text-color-secondary">{formatBytes(item.bytes)}</td>
                        <td class="px-4 py-3 text-color-secondary">{riskLabel(item.risk)}</td>
                        <td class="px-4 py-3 text-color-secondary">{item.reason}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Show>

      <Show when={state.result}>
        {(result) => (
          <div class="rounded-lg border border-outline-dimmed p-4">
            <h3 class="font-medium text-color-primary">{language.t("admin.storage.resultTitle")}</h3>
            <p class="mt-2 text-sm text-color-secondary">
              {language
                .t("admin.storage.resultSummary")
                .replace("{{removed}}", String(result().removed.length))
                .replace("{{bytes}}", formatBytes(result().total_bytes))
                .replace("{{failed}}", String(result().failed.length))}
            </p>
          </div>
        )}
      </Show>
    </section>
  )
}
