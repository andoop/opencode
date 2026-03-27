import { Button } from "@opencode-ai/ui/button"
import { Dialog as KobalteDialog } from "@kobalte/core/dialog"
import { For, Show, createEffect, createMemo, createResource, createSignal } from "solid-js"
import {
  type AuditPrompt,
  type AuditSession,
  type AuditSummary,
  type RegistryProject,
  type UserInfo,
  useAdminCommon,
} from "./shared"

export default function AdminAuditPage() {
  const { authHeaders, fetchFn, language, server } = useAdminCommon()
  let rootRef: HTMLDivElement | undefined

  const [auditSearch, setAuditSearch] = createSignal("")
  const [auditSearchDraft, setAuditSearchDraft] = createSignal("")
  const [auditUserFilter, setAuditUserFilter] = createSignal("")
  const [auditProjectFilter, setAuditProjectFilter] = createSignal("")
  const [selectedAuditSessionID, setSelectedAuditSessionID] = createSignal<string | null>(null)
  let auditScrollSnapshot: { top: number; left: number } | null = null

  const fetchUsers = async () => {
    const response = await fetchFn(`${server.url}/user`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error("Failed to fetch users")
    return response.json() as Promise<UserInfo[]>
  }

  const fetchProjects = async () => {
    const response = await fetchFn(`${server.url}/project/registry`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error("Failed to fetch projects")
    return response.json() as Promise<RegistryProject[]>
  }

  const fetchAuditSummary = async () => {
    const response = await fetchFn(`${server.url}/session/admin/summary`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error("Failed to fetch session summary")
    return response.json() as Promise<AuditSummary>
  }

  const [users] = createResource(fetchUsers)
  const [projects] = createResource(fetchProjects)
  const [auditSummary, { refetch: refetchAuditSummary }] = createResource(fetchAuditSummary)
  const [auditSessions, { refetch: refetchAuditSessions }] = createResource(
    () => ({
      search: auditSearch().trim(),
      userID: auditUserFilter() || undefined,
      projectID: auditProjectFilter() || undefined,
    }),
    async (query) => {
      const url = new URL(`${server.url}/session/admin/list`)
      url.searchParams.set("limit", "50")
      if (query.search) url.searchParams.set("search", query.search)
      if (query.userID) url.searchParams.set("userID", query.userID)
      if (query.projectID) url.searchParams.set("projectID", query.projectID)
      const response = await fetchFn(url.toString(), {
        headers: authHeaders(),
      })
      if (!response.ok) throw new Error("Failed to fetch session audit")
      return response.json() as Promise<AuditSession[]>
    },
  )
  const [auditPrompts, { refetch: refetchAuditPrompts }] = createResource(selectedAuditSessionID, async (sessionID) => {
    if (!sessionID) return [] as AuditPrompt[]
    const response = await fetchFn(`${server.url}/session/admin/${sessionID}/messages`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error("Failed to fetch session conversation")
    return response.json() as Promise<AuditPrompt[]>
  })

  const selectedAuditSession = createMemo(() =>
    (auditSessions() ?? []).find((item) => item.session.id === selectedAuditSessionID()),
  )

  const scrollElement = () => {
    let node = rootRef?.parentElement
    while (node) {
      const style = getComputedStyle(node)
      const overflowY = style.overflowY || style.overflow
      if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
        return node
      }
      node = node.parentElement
    }
    return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
  }

  const captureStableScroll = () => {
    const el = scrollElement()
    return {
      top: el.scrollTop,
      left: el.scrollLeft,
    }
  }

  const restoreStableScroll = () => {
    const snapshot = auditScrollSnapshot
    if (!snapshot) return
    const el = scrollElement()
    el.scrollTo({ top: snapshot.top, left: snapshot.left, behavior: "auto" })
    auditScrollSnapshot = null
  }

  const preserveStableScroll = (run: () => void) => {
    auditScrollSnapshot = captureStableScroll()
    run()
  }

  const openAuditPrompts = (sessionID: string) => {
    preserveStableScroll(() => {
      setSelectedAuditSessionID(sessionID)
    })
  }

  const applyAuditSearch = () => {
    preserveStableScroll(() => {
      setAuditSearch(auditSearchDraft())
    })
  }

  createEffect(() => {
    auditSessions()
    if (auditScrollSnapshot) restoreStableScroll()
  })

  createEffect(() => {
    auditPrompts()
  })

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "Never"
    return new Date(timestamp).toLocaleString()
  }

  const projectLabel = (item: { name?: string; directory: string }) => item.name || item.directory
  const showProjectDirectory = (item: { name?: string; directory: string }) =>
    !!item.name && item.name !== item.directory
  const isChinese = () => language.locale() === "zh" || language.locale() === "zht"
  const auditMessageRole = (role: AuditPrompt["role"]) => (role === "assistant" ? "AI" : isChinese() ? "用户" : "User")
  const auditPartLabel = (type: string) => {
    if (type === "tool") return isChinese() ? "工具调用" : "Tool call"
    if (type === "reasoning") return isChinese() ? "推理内容" : "Reasoning"
    if (type === "file") return isChinese() ? "文件上下文" : "File context"
    if (type === "patch") return isChinese() ? "代码补丁" : "Code patch"
    if (type === "snapshot") return isChinese() ? "快照" : "Snapshot"
    if (type === "agent") return isChinese() ? "智能体信息" : "Agent info"
    if (type === "subtask") return isChinese() ? "子任务" : "Subtask"
    if (type === "retry") return isChinese() ? "重试信息" : "Retry info"
    if (type === "compaction") return isChinese() ? "上下文压缩" : "Context compaction"
    return isChinese() ? "其他内容" : "Other content"
  }

  return (
    <section ref={rootRef} class="space-y-6">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-semibold text-color-primary">{language.t("admin.audit.title")}</h2>
          <p class="mt-1 text-sm text-color-secondary">{language.t("admin.audit.description")}</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            void refetchAuditSummary()
            void refetchAuditSessions()
            if (selectedAuditSessionID()) void refetchAuditPrompts()
          }}
        >
          {language.t("admin.audit.refresh")}
        </Button>
      </div>

      <Show when={auditSummary()}>
        {(summary) => (
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div class="rounded-lg border border-outline-dimmed p-4">
              <div class="text-xs text-color-secondary">{language.t("admin.audit.summary.sessions")}</div>
              <div class="mt-2 text-2xl font-semibold text-color-primary">{summary().sessions}</div>
            </div>
            <div class="rounded-lg border border-outline-dimmed p-4">
              <div class="text-xs text-color-secondary">{language.t("admin.audit.summary.users")}</div>
              <div class="mt-2 text-2xl font-semibold text-color-primary">{summary().users}</div>
            </div>
            <div class="rounded-lg border border-outline-dimmed p-4">
              <div class="text-xs text-color-secondary">{language.t("admin.audit.summary.projects")}</div>
              <div class="mt-2 text-2xl font-semibold text-color-primary">{summary().projects}</div>
            </div>
            <div class="rounded-lg border border-outline-dimmed p-4">
              <div class="text-xs text-color-secondary">{language.t("admin.audit.summary.prompts")}</div>
              <div class="mt-2 text-2xl font-semibold text-color-primary">{summary().prompts}</div>
            </div>
            <div class="rounded-lg border border-outline-dimmed p-4">
              <div class="text-xs text-color-secondary">{language.t("admin.audit.summary.lastActivity")}</div>
              <div class="mt-2 text-sm text-color-primary">{formatDate(summary().last_activity)}</div>
            </div>
          </div>
        )}
      </Show>

      <div class="rounded-lg border border-outline-dimmed p-4">
        <div class="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <input
            value={auditSearchDraft()}
            onInput={(e) => setAuditSearchDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return
              e.preventDefault()
              applyAuditSearch()
            }}
            placeholder={language.t("admin.audit.searchPlaceholder")}
            class="w-full rounded border border-outline-dimmed bg-background-input px-3 py-2 text-sm"
          />
          <select
            value={auditUserFilter()}
            onChange={(e) => {
              preserveStableScroll(() => {
                setAuditUserFilter(e.currentTarget.value)
              })
            }}
            class="w-full rounded border border-outline-dimmed bg-background-input px-3 py-2 text-sm"
          >
            <option value="">{language.t("admin.audit.filter.allUsers")}</option>
            <For each={users() ?? []}>{(user) => <option value={user.id}>{user.username}</option>}</For>
          </select>
          <select
            value={auditProjectFilter()}
            onChange={(e) => {
              preserveStableScroll(() => {
                setAuditProjectFilter(e.currentTarget.value)
              })
            }}
            class="w-full rounded border border-outline-dimmed bg-background-input px-3 py-2 text-sm"
          >
            <option value="">{language.t("admin.audit.filter.allProjects")}</option>
            <For each={projects() ?? []}>
              {(project) => <option value={project.project_id}>{project.name || project.directory}</option>}
            </For>
          </select>
          <Button variant="primary" onClick={applyAuditSearch}>
            {language.t("common.search.placeholder")}
          </Button>
        </div>
      </div>

      <Show when={auditSessions.loading}>
        <p class="text-color-secondary">{language.t("admin.audit.loading")}</p>
      </Show>

      <Show when={auditSessions.error}>
        <p class="text-auxiliary-error">{language.t("admin.audit.loadFailed")}</p>
      </Show>

      <Show when={auditSessions()}>
        <div class="overflow-x-auto rounded-lg border border-outline-dimmed">
          <table class="min-w-[1100px] w-full table-fixed">
            <thead class="border-b border-outline-dimmed bg-background-frame">
              <tr>
                <th class="px-4 py-3 text-left text-sm font-medium">{language.t("admin.audit.column.user")}</th>
                <th class="px-4 py-3 text-left text-sm font-medium">{language.t("admin.audit.column.project")}</th>
                <th class="px-4 py-3 text-left text-sm font-medium">{language.t("admin.audit.column.session")}</th>
                <th class="px-4 py-3 text-left text-sm font-medium">{language.t("admin.audit.column.prompts")}</th>
                <th class="px-4 py-3 text-left text-sm font-medium">{language.t("admin.audit.column.updated")}</th>
                <th class="px-4 py-3 text-left text-sm font-medium">{language.t("admin.audit.column.latestPrompt")}</th>
                <th class="px-4 py-3 text-left text-sm font-medium">{language.t("admin.audit.column.actions")}</th>
              </tr>
            </thead>
            <tbody>
              <For each={auditSessions()}>
                {(item) => (
                  <tr class="border-b border-outline-dimmed last:border-0">
                    <td class="px-4 py-3">{item.user.username || item.user.id || "-"}</td>
                    <td class="px-4 py-3">
                      <div class="break-words">{projectLabel(item.project)}</div>
                      <Show when={showProjectDirectory(item.project)}>
                        <div class="text-xs text-color-secondary break-all">{item.project.directory}</div>
                      </Show>
                    </td>
                    <td class="px-4 py-3">
                      <div class="break-words">{item.session.title}</div>
                      <div class="text-xs text-color-secondary break-all">{item.session.id}</div>
                    </td>
                    <td class="px-4 py-3 text-sm text-color-secondary">
                      {item.prompt_count} / {item.message_count}
                    </td>
                    <td class="px-4 py-3 text-sm text-color-secondary">{formatDate(item.session.time.updated)}</td>
                    <td class="max-w-md px-4 py-3 text-sm text-color-secondary">
                      <div class="line-clamp-2 whitespace-pre-wrap break-words">{item.last_prompt || "-"}</div>
                    </td>
                    <td class="px-4 py-3">
                      <Button size="small" variant="ghost" onClick={() => openAuditPrompts(item.session.id)}>
                        {language.t("admin.audit.viewPrompts")}
                      </Button>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>

      <KobalteDialog
        open={!!selectedAuditSession()}
        onOpenChange={(open) => {
          if (!open) {
            preserveStableScroll(() => {
              setSelectedAuditSessionID(null)
            })
          }
        }}
      >
        <KobalteDialog.Portal>
          <KobalteDialog.Overlay class="fixed inset-0" style={{ "background-color": "rgb(0 0 0 / 0.5)" }} />
          <KobalteDialog.Content
            class="fixed left-1/2 top-1/2 max-h-[85vh] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg border border-outline-dimmed bg-background-base p-6"
            onOpenAutoFocus={(e) => {
              restoreStableScroll()
              e.preventDefault()
            }}
            onCloseAutoFocus={(e) => {
              restoreStableScroll()
              e.preventDefault()
            }}
          >
            <Show when={selectedAuditSession()}>
              {(item) => (
                <>
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <KobalteDialog.Title class="text-lg font-semibold text-color-primary">
                        {language.t("admin.audit.promptDetail.title")}
                      </KobalteDialog.Title>
                      <KobalteDialog.Description class="mt-1 text-sm text-color-secondary">
                        {item().user.username || item().user.id || "-"} · {projectLabel(item().project)} ·{" "}
                        {item().session.title}
                      </KobalteDialog.Description>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        preserveStableScroll(() => {
                          setSelectedAuditSessionID(null)
                        })
                      }}
                    >
                      {language.t("common.close")}
                    </Button>
                  </div>

                  <Show when={auditPrompts.loading}>
                    <p class="mt-4 text-color-secondary">{language.t("admin.audit.prompts.loading")}</p>
                  </Show>

                  <Show when={auditPrompts.error}>
                    <p class="mt-4 text-auxiliary-error">{language.t("admin.audit.prompts.loadFailed")}</p>
                  </Show>

                  <Show
                    when={(auditPrompts() ?? []).length > 0}
                    fallback={
                      <p class="mt-4 text-sm text-color-secondary">{language.t("admin.audit.prompts.empty")}</p>
                    }
                  >
                    <div class="mt-4 space-y-3">
                      <For each={auditPrompts()}>
                        {(prompt) => (
                          <div class="rounded border border-outline-dimmed p-3">
                            <div class="flex items-center justify-between gap-3 text-xs text-color-secondary">
                              <span>{auditMessageRole(prompt.role)}</span>
                              <span>{formatDate(prompt.created)}</span>
                            </div>
                            <Show when={prompt.text}>
                              <div class="mt-2 whitespace-pre-wrap break-words text-sm text-color-primary">
                                {prompt.text}
                              </div>
                            </Show>
                            <Show when={prompt.parts.length > 0}>
                              <div class="mt-2 flex flex-wrap gap-2">
                                <For each={prompt.parts}>
                                  {(part) => (
                                    <span class="rounded bg-background-frame px-2 py-1 text-xs text-color-secondary">
                                      {auditPartLabel(part.type)} x{part.count}
                                    </span>
                                  )}
                                </For>
                              </div>
                            </Show>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </>
              )}
            </Show>
          </KobalteDialog.Content>
        </KobalteDialog.Portal>
      </KobalteDialog>
    </section>
  )
}
