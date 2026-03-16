import { createEffect, createMemo, createSignal, createResource, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useNavigate } from "@solidjs/router"
import { FEATURE_DEFAULTS, useAuth } from "@/context/auth"
import { useServer } from "@/context/server"
import { usePlatform } from "@/context/platform"
import { useLanguage } from "@/context/language"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Button } from "@opencode-ai/ui/button"
import { TextField } from "@opencode-ai/ui/text-field"
import { Dialog as KobalteDialog } from "@kobalte/core/dialog"
import { DialogSelectDirectory } from "@/components/dialog-select-directory"

interface UserInfo {
  id: string
  username: string
  email?: string
  role: "admin" | "user"
  status: "active" | "disabled"
  permission: {
    level: "full" | "readonly" | "custom"
    custom?: Record<string, string>
    allowed_agents?: string[]
    features?: {
      modes?: {
        ask?: boolean
        build?: boolean
        plan?: boolean
      }
      files?: boolean
      models?: boolean
      providers?: boolean
      servers?: boolean
      mcp?: boolean
    }
    models?: string[] | null
  }
  time: {
    created: number
    updated: number
    last_login?: number
  }
}

interface RegistryProject {
  id: string
  project_id: string
  directory: string
  name?: string
  description?: string
  created_by?: string
  vcs?: "git"
  time: {
    created: number
    updated: number
  }
}

interface ProviderInfo {
  id: string
  name: string
  models: Record<
    string,
    {
      id: string
      name: string
    }
  >
}

interface AuditSummary {
  sessions: number
  users: number
  projects: number
  prompts: number
  last_activity?: number
}

interface AuditSession {
  session: {
    id: string
    title: string
    projectID: string
    userID?: string
    time: {
      created: number
      updated: number
    }
  }
  user: {
    id?: string
    username?: string
  }
  project: {
    id: string
    name?: string
    description?: string
    directory: string
  }
  message_count: number
  prompt_count: number
  last_prompt?: string
  last_prompt_at?: number
}

interface AuditPrompt {
  messageID: string
  created: number
  role: "user" | "assistant"
  text?: string
  parts: Array<{
    type: string
    count: number
  }>
}

type FeatureState = {
  modes: {
    ask: boolean
    build: boolean
    plan: boolean
  }
  files: boolean
  models: boolean
  providers: boolean
  servers: boolean
  mcp: boolean
}

const FEATURE_ROWS = [
  { id: "modes.ask", label: "Ask 模式", description: "允许使用 ask 只读模式" },
  { id: "modes.build", label: "Build 模式", description: "允许使用 build 模式" },
  { id: "modes.plan", label: "Plan 模式", description: "允许使用 plan 模式" },
  { id: "files", label: "文件功能", description: "文件树、文件选择、上下文文件、Git/文件相关视图" },
  { id: "models", label: "模型入口", description: "模型选择和模型管理入口" },
  { id: "providers", label: "供应商入口", description: "供应商连接、断开和自定义供应商配置" },
  { id: "servers", label: "服务器入口", description: "服务器切换与服务器管理入口" },
  { id: "mcp", label: "MCP 管理", description: "MCP 列表、开关与管理入口" },
] as const

const DEFAULT_REGISTER_MODELS = ["cursor-cli/auto", "cursor-cli/composer-1", "cursor-cli/composer-1.5"]

function createRegisteredFeatures(): FeatureState {
  return {
    modes: {
      ask: true,
      build: false,
      plan: false,
    },
    files: true,
    models: false,
    providers: false,
    servers: false,
    mcp: false,
  }
}

function createFeatures(permission?: UserInfo["permission"]): FeatureState {
  return {
    modes: {
      ask: permission?.features?.modes?.ask ?? FEATURE_DEFAULTS.modes.ask,
      build: permission?.features?.modes?.build ?? FEATURE_DEFAULTS.modes.build,
      plan: permission?.features?.modes?.plan ?? FEATURE_DEFAULTS.modes.plan,
    },
    files: permission?.features?.files ?? FEATURE_DEFAULTS.files,
    models: permission?.features?.models ?? FEATURE_DEFAULTS.models,
    providers: permission?.features?.providers ?? FEATURE_DEFAULTS.providers,
    servers: permission?.features?.servers ?? FEATURE_DEFAULTS.servers,
    mcp: permission?.features?.mcp ?? FEATURE_DEFAULTS.mcp,
  }
}

function modelSummary(permission?: UserInfo["permission"]) {
  if (!permission) return "未配置"
  if (permission.models === null) return "全开放"
  if (permission.models === undefined) return "未配置"
  if (permission.models.length === 0) return "0 个模型"
  return `${permission.models.length} 个模型`
}

function FeatureMatrix(props: {
  value: FeatureState
  disabled?: boolean
  onToggle: (id: (typeof FEATURE_ROWS)[number]["id"], checked: boolean) => void
}) {
  return (
    <div class="rounded border border-outline-dimmed p-4 space-y-3">
      <div>
        <p class="text-sm text-color-primary">功能权限矩阵</p>
        <p class="text-xs text-color-secondary">未勾选的功能会在前端隐藏，后端也会拒绝对应请求。</p>
      </div>
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-outline-dimmed">
            <th class="pb-2 text-left font-medium">功能</th>
            <th class="pb-2 text-left font-medium">说明</th>
            <th class="pb-2 text-right font-medium">启用</th>
          </tr>
        </thead>
        <tbody>
          <For each={FEATURE_ROWS}>
            {(row) => {
              const checked = () => {
                if (row.id === "modes.ask") return props.value.modes.ask
                if (row.id === "modes.build") return props.value.modes.build
                if (row.id === "modes.plan") return props.value.modes.plan
                return props.value[row.id]
              }

              return (
                <tr class="border-b border-outline-dimmed last:border-0">
                  <td class="py-3 pr-3 align-top">{row.label}</td>
                  <td class="py-3 pr-3 align-top text-color-secondary">{row.description}</td>
                  <td class="py-3 text-right align-top">
                    <input
                      type="checkbox"
                      checked={checked()}
                      disabled={props.disabled}
                      onChange={(e) => props.onToggle(row.id, e.currentTarget.checked)}
                    />
                  </td>
                </tr>
              )
            }}
          </For>
        </tbody>
      </table>
    </div>
  )
}

function ModelWhitelist(props: {
  providers?: ProviderInfo[]
  search: string
  value: string[] | null
  disabled?: boolean
  error?: string
  onSearch: (value: string) => void
  onToggle: (value: string, checked: boolean) => void
  onAllowAll: () => void
  onClear: () => void
}) {
  const unrestricted = createMemo(() => props.value === null)
  const value = createMemo(() => new Set(props.value ?? []))
  const selected = createMemo(() =>
    (props.providers ?? [])
      .flatMap((provider) =>
        Object.values(provider.models)
          .filter((model) => value().has(`${provider.id}/${model.id}`))
          .map((model) => ({
            key: `${provider.id}/${model.id}`,
            providerID: provider.id,
            providerName: provider.name,
            modelID: model.id,
            modelName: model.name,
          })),
      )
      .sort((a, b) => a.providerName.localeCompare(b.providerName) || a.modelName.localeCompare(b.modelName)),
  )
  const filtered = createMemo(() => {
    const query = props.search.trim().toLowerCase()
    return (props.providers ?? []).flatMap((provider) => {
      const models = Object.values(provider.models)
        .filter((model) => {
          if (!query) return true
          return [provider.name, provider.id, model.name, model.id].some((item) =>
            item.toLowerCase().includes(query),
          )
        })
        .sort((a, b) => {
          const aSelected = value().has(`${provider.id}/${a.id}`)
          const bSelected = value().has(`${provider.id}/${b.id}`)
          if (aSelected && !bSelected) return -1
          if (!aSelected && bSelected) return 1
          return a.name.localeCompare(b.name)
        })
      if (models.length === 0) return []
      return [
        {
          ...provider,
          models,
        },
      ]
    })
  })

  return (
    <div class="rounded border border-outline-dimmed p-4 space-y-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-sm text-color-primary">可用模型</p>
          <p class="text-xs text-color-secondary">默认不开放任何模型。只有“清空限制”才表示全开放，这里不影响供应商管理权限。</p>
        </div>
        <div class="flex gap-2">
          <Button size="small" variant="ghost" onClick={props.onAllowAll} disabled={props.disabled}>
            全部允许
          </Button>
          <Button size="small" variant="ghost" onClick={props.onClear} disabled={props.disabled}>
            清空限制
          </Button>
        </div>
      </div>
      <input
        value={props.search}
        onInput={(e) => props.onSearch(e.currentTarget.value)}
        placeholder="搜索 provider / model / id"
        class="w-full rounded border border-outline-dimmed bg-background-input px-3 py-2 text-sm"
      />
      <Show when={props.error}>
        <p class="text-xs text-auxiliary-error">{props.error}</p>
      </Show>
      <Show when={unrestricted()}>
        <div class="rounded border border-outline-dimmed p-3 text-sm text-color-secondary">
          当前为清空限制状态：该用户可使用所有模型，包括后续新增模型。
        </div>
      </Show>
      <Show when={selected().length > 0}>
        <div class="rounded border border-outline-dimmed p-3 space-y-2">
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm text-color-primary">已选模型</p>
            <p class="text-xs text-color-secondary">{selected().length} 个</p>
          </div>
          <div class="max-h-36 space-y-2 overflow-auto">
            <For each={selected()}>
              {(item) => (
                <label class="flex items-start justify-between gap-3 rounded border border-outline-dimmed px-3 py-2 text-sm">
                  <div>
                    <div>{item.modelName}</div>
                    <div class="text-xs text-color-secondary">
                      {item.providerName} · {item.key}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked
                    disabled={props.disabled}
                    onChange={(e) => props.onToggle(item.key, e.currentTarget.checked)}
                  />
                </label>
              )}
            </For>
          </div>
        </div>
      </Show>
      <div class="max-h-72 space-y-3 overflow-auto rounded border border-outline-dimmed p-3">
        <Show when={props.providers} fallback={<p class="text-sm text-color-secondary">Loading models...</p>}>
          <Show when={filtered().length > 0} fallback={<p class="text-sm text-color-secondary">No models found.</p>}>
            <For each={filtered()}>
              {(provider) => (
                <div class="space-y-2">
                  <div class="text-sm font-medium text-color-primary">
                    {provider.name}
                    <span class="ml-2 text-xs text-color-secondary">{provider.id}</span>
                  </div>
                  <div class="space-y-2">
                    <For each={provider.models}>
                      {(model) => {
                        const key = `${provider.id}/${model.id}`
                        return (
                          <label class="flex items-start justify-between gap-3 rounded border border-outline-dimmed px-3 py-2 text-sm">
                            <div>
                              <div class="flex items-center gap-2">
                                <span>{model.name}</span>
                                <Show when={unrestricted() || value().has(key)}>
                                  <span class="text-xs text-auxiliary-success">已选</span>
                                </Show>
                              </div>
                              <div class="text-xs text-color-secondary">{key}</div>
                            </div>
                            <input
                              type="checkbox"
                              checked={unrestricted() || value().has(key)}
                              disabled={props.disabled}
                              onChange={(e) => props.onToggle(key, e.currentTarget.checked)}
                            />
                          </label>
                        )
                      }}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </Show>
      </div>
    </div>
  )
}

export default function AdminPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const server = useServer()
  const platform = usePlatform()
  const language = useLanguage()
  const dialog = useDialog()
  let rootRef: HTMLDivElement | undefined

  // Redirect if not admin
  if (!auth.isAdmin) {
    navigate("/")
    return null
  }

  const fetchFn = platform.fetch ?? fetch

  const authHeaders = (): HeadersInit => {
    const token = auth.token
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

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

  const fetchProviders = async () => {
    const response = await fetchFn(`${server.url}/provider`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error("Failed to fetch models")
    const data = (await response.json()) as { all: ProviderInfo[]; connected: string[] }
    return data.all.filter((provider) => data.connected.includes(provider.id))
  }

  const fetchAuditSummary = async () => {
    const response = await fetchFn(`${server.url}/session/admin/summary`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error("Failed to fetch session summary")
    return response.json() as Promise<AuditSummary>
  }

  const [users, { refetch }] = createResource(fetchUsers)
  const [projects, { refetch: refetchProjects }] = createResource(fetchProjects)
  const [providers] = createResource(fetchProviders)
  const [auditSearch, setAuditSearch] = createSignal("")
  const [auditSearchDraft, setAuditSearchDraft] = createSignal("")
  const [auditUserFilter, setAuditUserFilter] = createSignal("")
  const [auditProjectFilter, setAuditProjectFilter] = createSignal("")
  const [selectedAuditSessionID, setSelectedAuditSessionID] = createSignal<string | null>(null)
  let auditScrollSnapshot: { top: number; left: number } | null = null
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
  const [showCreateDialog, setShowCreateDialog] = createSignal(false)
  const [showEditDialog, setShowEditDialog] = createSignal(false)
  const [showResetPasswordDialog, setShowResetPasswordDialog] = createSignal(false)
  const [showProjectDialog, setShowProjectDialog] = createSignal(false)
  const [editingUser, setEditingUser] = createSignal<UserInfo | null>(null)
  const [editingProject, setEditingProject] = createSignal<RegistryProject | null>(null)
  const [error, setError] = createSignal<string | null>(null)

  // Create user form state
  const [newUsername, setNewUsername] = createSignal("")
  const [newPassword, setNewPassword] = createSignal("")
  const [newEmail, setNewEmail] = createSignal("")
  const [newRole, setNewRole] = createSignal<"admin" | "user">("user")
  const [newPermissionLevel, setNewPermissionLevel] = createSignal<"full" | "readonly" | "custom">("custom")

  // Edit user form state
  const [editRole, setEditRole] = createSignal<"admin" | "user">("user")
  const [editStatus, setEditStatus] = createSignal<"active" | "disabled">("active")
  const [editPermissionLevel, setEditPermissionLevel] = createSignal<"full" | "readonly" | "custom">("full")
  const [editCustomEdit, setEditCustomEdit] = createSignal<"allow" | "ask" | "deny">("allow")
  const [editCustomWrite, setEditCustomWrite] = createSignal<"allow" | "ask" | "deny">("allow")
  const [editCustomBash, setEditCustomBash] = createSignal<"allow" | "ask" | "deny">("ask")
  const [editCustomRead, setEditCustomRead] = createSignal<"allow" | "ask" | "deny">("allow")

  // Create user custom permissions
  const [newCustomEdit, setNewCustomEdit] = createSignal<"allow" | "ask" | "deny">("allow")
  const [newCustomWrite, setNewCustomWrite] = createSignal<"allow" | "ask" | "deny">("allow")
  const [newCustomBash, setNewCustomBash] = createSignal<"allow" | "ask" | "deny">("ask")
  const [newCustomRead, setNewCustomRead] = createSignal<"allow" | "ask" | "deny">("allow")
  const [newFeatures, setNewFeatures] = createStore<FeatureState>(createRegisteredFeatures())
  const [editFeatures, setEditFeatures] = createStore<FeatureState>(createFeatures())
  const [newModels, setNewModels] = createSignal<string[] | null>([...DEFAULT_REGISTER_MODELS])
  const [editModels, setEditModels] = createSignal<string[] | null>([])
  const [newModelSearch, setNewModelSearch] = createSignal("")
  const [editModelSearch, setEditModelSearch] = createSignal("")

  // Reset password form state
  const [newPasswordReset, setNewPasswordReset] = createSignal("")
  const [projectDirectory, setProjectDirectory] = createSignal("")
  const [projectName, setProjectName] = createSignal("")
  const [projectDescription, setProjectDescription] = createSignal("")
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

  const toggleFeatures = (
    setFeatures: typeof setNewFeatures,
    id: (typeof FEATURE_ROWS)[number]["id"],
    checked: boolean,
  ) => {
    if (id === "modes.ask") {
      setFeatures("modes", "ask", checked)
      return
    }
    if (id === "modes.build") {
      setFeatures("modes", "build", checked)
      return
    }
    if (id === "modes.plan") {
      setFeatures("modes", "plan", checked)
      return
    }
    setFeatures(id, checked)
  }

  const allModels = createMemo(() =>
    (providers() ?? []).flatMap((provider) =>
      Object.values(provider.models).map((model) => `${provider.id}/${model.id}`),
    ),
  )

  const toggleModel = (
    list: () => string[] | null,
    setList: (value: string[] | null) => void,
    value: string,
    checked: boolean,
  ) => {
    if (list() === null) {
      if (checked) return
      setList(allModels().filter((item) => item !== value))
      return
    }
    if (checked) {
      setList(Array.from(new Set([...(list() ?? []), value])))
      return
    }
    setList((list() ?? []).filter((item) => item !== value))
  }

  const createUser = async () => {
    setError(null)
    try {
      const permission: UserInfo["permission"] = { level: newPermissionLevel() }
      if (newPermissionLevel() === "custom") {
        permission.custom = {
          edit: newCustomEdit(),
          write: newCustomWrite(),
          bash: newCustomBash(),
          read: newCustomRead(),
        }
      }
      if (newRole() !== "admin") {
        permission.features = {
          modes: { ...newFeatures.modes },
          files: newFeatures.files,
          models: newFeatures.models,
          providers: newFeatures.providers,
          servers: newFeatures.servers,
          mcp: newFeatures.mcp,
        }
        permission.models = newModels()
      }

      const response = await fetchFn(`${server.url}/user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          username: newUsername(),
          password: newPassword(),
          email: newEmail() || undefined,
          role: newRole(),
          permission,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || data.message || "Failed to create user")
      }

      setShowCreateDialog(false)
      setNewUsername("")
      setNewPassword("")
      setNewEmail("")
      setNewRole("user")
      setNewPermissionLevel("custom")
      setNewCustomEdit("allow")
      setNewCustomWrite("allow")
      setNewCustomBash("ask")
      setNewCustomRead("allow")
      setNewFeatures(createRegisteredFeatures())
      setNewModels([...DEFAULT_REGISTER_MODELS])
      setNewModelSearch("")
      void refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create user")
    }
  }

  const updateUser = async () => {
    const user = editingUser()
    if (!user) return

    setError(null)
    try {
      const permission: UserInfo["permission"] = { level: editPermissionLevel() }
      if (editPermissionLevel() === "custom") {
        permission.custom = {
          edit: editCustomEdit(),
          write: editCustomWrite(),
          bash: editCustomBash(),
          read: editCustomRead(),
        }
      }
      if (editRole() !== "admin") {
        permission.features = {
          modes: { ...editFeatures.modes },
          files: editFeatures.files,
          models: editFeatures.models,
          providers: editFeatures.providers,
          servers: editFeatures.servers,
          mcp: editFeatures.mcp,
        }
        permission.models = editModels()
      }

      const response = await fetchFn(`${server.url}/user/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          role: editRole(),
          status: editStatus(),
          permission,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || data.message || "Failed to update user")
      }

      setShowEditDialog(false)
      setEditingUser(null)
      void refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update user")
    }
  }

  const resetPassword = async () => {
    const user = editingUser()
    if (!user) return

    setError(null)
    try {
      const response = await fetchFn(`${server.url}/user/${user.id}/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          new_password: newPasswordReset(),
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || data.message || "Failed to reset password")
      }

      setShowResetPasswordDialog(false)
      setEditingUser(null)
      setNewPasswordReset("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset password")
    }
  }

  const deleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return

    setError(null)
    try {
      const response = await fetchFn(`${server.url}/user/${userId}`, {
        method: "DELETE",
        headers: authHeaders(),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || data.message || "Failed to delete user")
      }

      void refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete user")
    }
  }

  const addProject = async (directory: string) => {
    setError(null)
    try {
      const response = await fetchFn(`${server.url}/project/registry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          directory,
          name: projectName() || undefined,
          description: projectDescription() || undefined,
        }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || data.message || "Failed to add project")
      }
      setShowProjectDialog(false)
      setProjectDirectory("")
      setProjectName("")
      setProjectDescription("")
      void refetchProjects()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add project")
    }
  }

  const chooseProjectDirectory = async () => {
    const resolve = (result: string | string[] | null) => {
      const directory = Array.isArray(result) ? result[0] : result
      if (!directory) return
      setEditingProject(null)
      setProjectDirectory(directory)
      setProjectName("")
      setProjectDescription("")
      setShowProjectDialog(true)
    }

    if (platform.openDirectoryPickerDialog && server.isLocal()) {
      const result = await platform.openDirectoryPickerDialog({
        title: "Add project",
        multiple: false,
      })
      resolve(result)
      return
    }

    dialog.show(() => <DialogSelectDirectory onSelect={resolve} />)
  }

  const openProjectDialog = (project: RegistryProject) => {
    setEditingProject(project)
    setProjectDirectory(project.directory)
    setProjectName(project.name ?? "")
    setProjectDescription(project.description ?? "")
    setShowProjectDialog(true)
  }

  const saveProject = async () => {
    const project = editingProject()
    setError(null)
    try {
      if (!project) {
        await addProject(projectDirectory())
        return
      }
      const response = await fetchFn(`${server.url}/project/registry/${project.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          name: projectName(),
          description: projectDescription(),
        }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || data.message || "Failed to update project")
      }
      setShowProjectDialog(false)
      setEditingProject(null)
      setProjectDirectory("")
      setProjectName("")
      setProjectDescription("")
      void refetchProjects()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update project")
    }
  }

  const deleteProject = async (project: RegistryProject) => {
    if (!confirm(`Remove project ${project.name || project.directory}?`)) return
    setError(null)
    try {
      const response = await fetchFn(`${server.url}/project/registry/${project.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || data.message || "Failed to remove project")
      }
      void refetchProjects()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove project")
    }
  }

  const openEditDialog = (user: UserInfo) => {
    setEditingUser(user)
    setEditRole(user.role)
    setEditStatus(user.status)
    setEditPermissionLevel(user.permission.level)
    if (user.permission.custom) {
      setEditCustomEdit((user.permission.custom.edit as "allow" | "ask" | "deny") ?? "allow")
      setEditCustomWrite((user.permission.custom.write as "allow" | "ask" | "deny") ?? "allow")
      setEditCustomBash((user.permission.custom.bash as "allow" | "ask" | "deny") ?? "ask")
      setEditCustomRead((user.permission.custom.read as "allow" | "ask" | "deny") ?? "allow")
    } else {
      setEditCustomEdit("allow")
      setEditCustomWrite("allow")
      setEditCustomBash("ask")
      setEditCustomRead("allow")
    }
    setEditFeatures(createFeatures(user.permission))
    setEditModels(user.permission.models ?? [])
    setEditModelSearch("")
    setShowEditDialog(true)
  }

  const openResetPasswordDialog = (user: UserInfo) => {
    setEditingUser(user)
    setNewPasswordReset("")
    setShowResetPasswordDialog(true)
  }

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "Never"
    return new Date(timestamp).toLocaleString()
  }

  const projectLabel = (item: { name?: string; directory: string }) => item.name || item.directory
  const showProjectDirectory = (item: { name?: string; directory: string }) =>
    !!item.name && item.name !== item.directory
  const isChinese = () => language.locale() === "zh" || language.locale() === "zht"
  const auditMessageRole = (role: AuditPrompt["role"]) =>
    role === "assistant" ? (isChinese() ? "AI" : "AI") : isChinese() ? "用户" : "User"
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
    <div ref={rootRef} class="mx-auto max-w-6xl p-6 lg:p-8">
      <div class="mb-8 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-semibold text-color-primary">{language.t("sidebar.userManagement")}</h1>
          <p class="mt-1 text-sm text-color-secondary">{language.t("admin.page.description")}</p>
        </div>
        <div class="flex gap-4">
          <Button variant="ghost" onClick={() => navigate("/")}>
            {language.t("admin.action.backHome")}
          </Button>
          <Button variant="primary" onClick={() => setShowCreateDialog(true)}>
            {language.t("admin.action.createUser")}
          </Button>
        </div>
      </div>

      <Show when={error()}>
        <div class="mb-4 rounded-md bg-auxiliary-error/10 p-3">
          <p class="text-sm text-auxiliary-error">{error()}</p>
        </div>
      </Show>

      <Show when={users.loading}>
        <p class="text-color-secondary">Loading users...</p>
      </Show>

      <Show when={users.error}>
        <p class="text-auxiliary-error">Failed to load users</p>
      </Show>

      <Show when={users()}>
        <div class="overflow-x-auto rounded-lg border border-outline-dimmed">
          <table class="min-w-[920px] w-full">
            <thead class="border-b border-outline-dimmed bg-background-frame">
              <tr>
                <th class="px-4 py-3 text-left text-sm font-medium">Username</th>
                <th class="px-4 py-3 text-left text-sm font-medium">Email</th>
                <th class="px-4 py-3 text-left text-sm font-medium">Role</th>
                <th class="px-4 py-3 text-left text-sm font-medium">Permission</th>
                <th class="px-4 py-3 text-left text-sm font-medium">Models</th>
                <th class="px-4 py-3 text-left text-sm font-medium">Status</th>
                <th class="px-4 py-3 text-left text-sm font-medium">Last Login</th>
                <th class="px-4 py-3 text-left text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              <For each={users()}>
                {(user) => (
                  <tr class="border-b border-outline-dimmed last:border-0">
                    <td class="px-4 py-3">{user.username}</td>
                    <td class="px-4 py-3">{user.email || "-"}</td>
                    <td class="px-4 py-3">
                      <span
                        class={`rounded px-2 py-1 text-xs ${
                          user.role === "admin"
                            ? "bg-auxiliary-warning/20 text-auxiliary-warning"
                            : "bg-auxiliary-success/20 text-auxiliary-success"
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td class="px-4 py-3">
                      <span class="text-xs">{user.permission.level}</span>
                    </td>
                    <td class="px-4 py-3 text-sm text-color-secondary">
                      {user.role === "admin" ? "全开放" : modelSummary(user.permission)}
                    </td>
                    <td class="px-4 py-3">
                      <span
                        class={`rounded px-2 py-1 text-xs ${
                          user.status === "active"
                            ? "bg-auxiliary-success/20 text-auxiliary-success"
                            : "bg-auxiliary-error/20 text-auxiliary-error"
                        }`}
                      >
                        {user.status}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-sm text-color-secondary">
                      {formatDate(user.time.last_login)}
                    </td>
                    <td class="px-4 py-3">
                      <div class="flex gap-2">
                        <Button size="small" variant="ghost" onClick={() => openEditDialog(user)}>
                          Edit
                        </Button>
                        <Button
                          size="small"
                          variant="ghost"
                          onClick={() => openResetPasswordDialog(user)}
                        >
                          Reset Password
                        </Button>
                        <Show when={user.id !== auth.user?.id}>
                          <Button
                            size="small"
                            variant="secondary"
                            onClick={() => deleteUser(user.id)}
                          >
                            Delete
                          </Button>
                        </Show>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>

      <div class="mt-10 mb-8 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-semibold text-color-primary">{language.t("admin.projectRegistry.title")}</h2>
          <p class="mt-1 text-sm text-color-secondary">{language.t("admin.projectRegistry.description")}</p>
        </div>
        <Button variant="primary" onClick={() => void chooseProjectDirectory()}>
          {language.t("admin.projectRegistry.add")}
        </Button>
      </div>

      <Show when={projects.loading}>
        <p class="text-color-secondary">Loading projects...</p>
      </Show>

      <Show when={projects.error}>
        <p class="text-auxiliary-error">Failed to load projects</p>
      </Show>

      <Show when={projects()}>
        <div class="overflow-x-auto rounded-lg border border-outline-dimmed">
          <table class="min-w-[980px] w-full table-fixed">
            <thead class="border-b border-outline-dimmed bg-background-frame">
              <tr>
                <th class="px-4 py-3 text-left text-sm font-medium">{language.t("admin.projectRegistry.column.name")}</th>
                <th class="px-4 py-3 text-left text-sm font-medium">{language.t("admin.projectRegistry.column.description")}</th>
                <th class="px-4 py-3 text-left text-sm font-medium">{language.t("admin.projectRegistry.column.directory")}</th>
                <th class="px-4 py-3 text-left text-sm font-medium">{language.t("admin.projectRegistry.column.added")}</th>
                <th class="px-4 py-3 text-left text-sm font-medium">{language.t("admin.projectRegistry.column.actions")}</th>
              </tr>
            </thead>
            <tbody>
              <For each={projects()}>
                {(project) => (
                  <tr class="border-b border-outline-dimmed last:border-0">
                    <td class="px-4 py-3">{project.name || "-"}</td>
                    <td class="max-w-md px-4 py-3 text-sm text-color-secondary">
                      <div class="line-clamp-3 whitespace-pre-wrap break-words">{project.description || "-"}</div>
                    </td>
                    <td class="px-4 py-3 text-sm text-color-secondary break-all">{project.directory}</td>
                    <td class="px-4 py-3 text-sm text-color-secondary">{formatDate(project.time.created)}</td>
                    <td class="px-4 py-3">
                      <div class="flex gap-2">
                        <Button size="small" variant="ghost" onClick={() => openProjectDialog(project)}>
                          {language.t("common.edit")}
                        </Button>
                        <Button size="small" variant="secondary" onClick={() => void deleteProject(project)}>
                          {language.t("common.delete")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>

      <div class="mt-10 mb-8 flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-semibold text-color-primary">{language.t("admin.audit.title")}</h2>
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

      <div class="mt-6 rounded-lg border border-outline-dimmed p-4">
        <div class="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <input
            value={auditSearchDraft()}
            onInput={(e) => {
              setAuditSearchDraft(e.currentTarget.value)
            }}
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
            <For each={projects() ?? []}>{(project) => <option value={project.project_id}>{project.name || project.directory}</option>}</For>
          </select>
          <Button variant="primary" onClick={applyAuditSearch}>
            {language.t("common.search.placeholder")}
          </Button>
        </div>
      </div>

      <Show when={auditSessions.loading}>
        <p class="mt-4 text-color-secondary">{language.t("admin.audit.loading")}</p>
      </Show>

      <Show when={auditSessions.error}>
        <p class="mt-4 text-auxiliary-error">{language.t("admin.audit.loadFailed")}</p>
      </Show>

      <Show when={auditSessions()}>
        <div class="mt-4 overflow-x-auto rounded-lg border border-outline-dimmed">
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
          <KobalteDialog.Overlay
            class="fixed inset-0"
            style={{ "background-color": "rgb(0 0 0 / 0.5)" }}
          />
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
                    fallback={<p class="mt-4 text-sm text-color-secondary">{language.t("admin.audit.prompts.empty")}</p>}
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

      {/* Create User Dialog */}
      <KobalteDialog open={showCreateDialog()} onOpenChange={setShowCreateDialog}>
        <KobalteDialog.Portal>
          <KobalteDialog.Overlay class="fixed inset-0 bg-black/50" />
          <KobalteDialog.Content class="fixed left-1/2 top-1/2 max-h-[90vh] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg border border-outline-dimmed bg-background-base p-6">
            <KobalteDialog.Title class="text-lg font-semibold">Create New User</KobalteDialog.Title>
            <KobalteDialog.Description class="mt-1 text-sm text-color-secondary">
              Add a new user to the system
            </KobalteDialog.Description>

            <div class="mt-4 space-y-4">
              <TextField
                label="Username"
                value={newUsername()}
                onChange={setNewUsername}
                placeholder="Enter username"
              />
              <TextField
                label="Password"
                type="password"
                value={newPassword()}
                onChange={setNewPassword}
                placeholder="Enter password"
              />
              <TextField
                label="Email (optional)"
                type="email"
                value={newEmail()}
                onChange={setNewEmail}
                placeholder="Enter email"
              />
              <div>
                <label class="block text-sm font-medium">Role</label>
                <select
                  value={newRole()}
                  onChange={(e) => setNewRole(e.currentTarget.value as "admin" | "user")}
                  class="mt-1 w-full rounded border border-outline-dimmed bg-background-input px-3 py-2"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium">Permission Level</label>
                <select
                  value={newPermissionLevel()}
                  onChange={(e) =>
                    setNewPermissionLevel(e.currentTarget.value as "full" | "readonly" | "custom")
                  }
                  class="mt-1 w-full rounded border border-outline-dimmed bg-background-input px-3 py-2"
                >
                  <option value="full">Full Access</option>
                  <option value="readonly">Read Only</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <Show when={newPermissionLevel() === "custom"}>
                <div class="rounded border border-outline-dimmed p-4 space-y-3">
                  <p class="text-sm text-color-secondary">Custom Permission Settings</p>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs font-medium">Edit Files</label>
                      <select
                        value={newCustomEdit()}
                        onChange={(e) => setNewCustomEdit(e.currentTarget.value as "allow" | "ask" | "deny")}
                        class="mt-1 w-full rounded border border-outline-dimmed bg-background-input px-2 py-1 text-sm"
                      >
                        <option value="allow">Allow</option>
                        <option value="ask">Ask</option>
                        <option value="deny">Deny</option>
                      </select>
                    </div>
                    <div>
                      <label class="block text-xs font-medium">Write Files</label>
                      <select
                        value={newCustomWrite()}
                        onChange={(e) => setNewCustomWrite(e.currentTarget.value as "allow" | "ask" | "deny")}
                        class="mt-1 w-full rounded border border-outline-dimmed bg-background-input px-2 py-1 text-sm"
                      >
                        <option value="allow">Allow</option>
                        <option value="ask">Ask</option>
                        <option value="deny">Deny</option>
                      </select>
                    </div>
                    <div>
                      <label class="block text-xs font-medium">Run Commands</label>
                      <select
                        value={newCustomBash()}
                        onChange={(e) => setNewCustomBash(e.currentTarget.value as "allow" | "ask" | "deny")}
                        class="mt-1 w-full rounded border border-outline-dimmed bg-background-input px-2 py-1 text-sm"
                      >
                        <option value="allow">Allow</option>
                        <option value="ask">Ask</option>
                        <option value="deny">Deny</option>
                      </select>
                    </div>
                    <div>
                      <label class="block text-xs font-medium">Read Files</label>
                      <select
                        value={newCustomRead()}
                        onChange={(e) => setNewCustomRead(e.currentTarget.value as "allow" | "ask" | "deny")}
                        class="mt-1 w-full rounded border border-outline-dimmed bg-background-input px-2 py-1 text-sm"
                      >
                        <option value="allow">Allow</option>
                        <option value="ask">Ask</option>
                        <option value="deny">Deny</option>
                      </select>
                    </div>
                  </div>
                </div>
              </Show>
              <Show
                when={newRole() !== "admin"}
                fallback={
                  <div class="rounded border border-outline-dimmed p-4 text-sm text-color-secondary">
                    Admin users always have all feature permissions enabled.
                  </div>
                }
              >
                <FeatureMatrix
                  value={newFeatures}
                  onToggle={(id, checked) => toggleFeatures(setNewFeatures, id, checked)}
                />
                <ModelWhitelist
                  providers={providers()}
                  search={newModelSearch()}
                  value={newModels()}
                  error={providers.error instanceof Error ? providers.error.message : undefined}
                  onSearch={setNewModelSearch}
                  onToggle={(value, checked) => toggleModel(newModels, setNewModels, value, checked)}
                  onAllowAll={() => setNewModels(allModels())}
                  onClear={() => setNewModels(null)}
                />
              </Show>
            </div>

            <div class="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={createUser} disabled={!newUsername() || !newPassword()}>
                Create User
              </Button>
            </div>
          </KobalteDialog.Content>
        </KobalteDialog.Portal>
      </KobalteDialog>

      {/* Edit User Dialog */}
      <KobalteDialog open={showEditDialog()} onOpenChange={setShowEditDialog}>
        <KobalteDialog.Portal>
          <KobalteDialog.Overlay class="fixed inset-0 bg-black/50" />
          <KobalteDialog.Content class="fixed left-1/2 top-1/2 max-h-[90vh] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg border border-outline-dimmed bg-background-base p-6">
            <KobalteDialog.Title class="text-lg font-semibold">
              Edit User: {editingUser()?.username}
            </KobalteDialog.Title>
            <KobalteDialog.Description class="mt-1 text-sm text-color-secondary">
              Update user settings
            </KobalteDialog.Description>

            <div class="mt-4 space-y-4">
              <div>
                <label class="block text-sm font-medium">Role</label>
                <select
                  value={editRole()}
                  onChange={(e) => setEditRole(e.currentTarget.value as "admin" | "user")}
                  class="mt-1 w-full rounded border border-outline-dimmed bg-background-input px-3 py-2"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium">Status</label>
                <select
                  value={editStatus()}
                  onChange={(e) => setEditStatus(e.currentTarget.value as "active" | "disabled")}
                  class="mt-1 w-full rounded border border-outline-dimmed bg-background-input px-3 py-2"
                >
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium">Permission Level</label>
                <select
                  value={editPermissionLevel()}
                  onChange={(e) =>
                    setEditPermissionLevel(e.currentTarget.value as "full" | "readonly" | "custom")
                  }
                  class="mt-1 w-full rounded border border-outline-dimmed bg-background-input px-3 py-2"
                >
                  <option value="full">Full Access</option>
                  <option value="readonly">Read Only</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <Show when={editPermissionLevel() === "custom"}>
                <div class="rounded border border-outline-dimmed p-4 space-y-3">
                  <p class="text-sm text-color-secondary">Custom Permission Settings</p>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label class="block text-xs font-medium">Edit Files</label>
                      <select
                        value={editCustomEdit()}
                        onChange={(e) => setEditCustomEdit(e.currentTarget.value as "allow" | "ask" | "deny")}
                        class="mt-1 w-full rounded border border-outline-dimmed bg-background-input px-2 py-1 text-sm"
                      >
                        <option value="allow">Allow</option>
                        <option value="ask">Ask</option>
                        <option value="deny">Deny</option>
                      </select>
                    </div>
                    <div>
                      <label class="block text-xs font-medium">Write Files</label>
                      <select
                        value={editCustomWrite()}
                        onChange={(e) => setEditCustomWrite(e.currentTarget.value as "allow" | "ask" | "deny")}
                        class="mt-1 w-full rounded border border-outline-dimmed bg-background-input px-2 py-1 text-sm"
                      >
                        <option value="allow">Allow</option>
                        <option value="ask">Ask</option>
                        <option value="deny">Deny</option>
                      </select>
                    </div>
                    <div>
                      <label class="block text-xs font-medium">Run Commands</label>
                      <select
                        value={editCustomBash()}
                        onChange={(e) => setEditCustomBash(e.currentTarget.value as "allow" | "ask" | "deny")}
                        class="mt-1 w-full rounded border border-outline-dimmed bg-background-input px-2 py-1 text-sm"
                      >
                        <option value="allow">Allow</option>
                        <option value="ask">Ask</option>
                        <option value="deny">Deny</option>
                      </select>
                    </div>
                    <div>
                      <label class="block text-xs font-medium">Read Files</label>
                      <select
                        value={editCustomRead()}
                        onChange={(e) => setEditCustomRead(e.currentTarget.value as "allow" | "ask" | "deny")}
                        class="mt-1 w-full rounded border border-outline-dimmed bg-background-input px-2 py-1 text-sm"
                      >
                        <option value="allow">Allow</option>
                        <option value="ask">Ask</option>
                        <option value="deny">Deny</option>
                      </select>
                    </div>
                  </div>
                </div>
              </Show>
              <Show
                when={editRole() !== "admin"}
                fallback={
                  <div class="rounded border border-outline-dimmed p-4 text-sm text-color-secondary">
                    Admin users always have all feature permissions enabled.
                  </div>
                }
              >
                <FeatureMatrix
                  value={editFeatures}
                  onToggle={(id, checked) => toggleFeatures(setEditFeatures, id, checked)}
                />
                <ModelWhitelist
                  providers={providers()}
                  search={editModelSearch()}
                  value={editModels()}
                  error={providers.error instanceof Error ? providers.error.message : undefined}
                  onSearch={setEditModelSearch}
                  onToggle={(value, checked) => toggleModel(editModels, setEditModels, value, checked)}
                  onAllowAll={() => setEditModels(allModels())}
                  onClear={() => setEditModels(null)}
                />
              </Show>
            </div>

            <div class="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setShowEditDialog(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={updateUser}>
                Save Changes
              </Button>
            </div>
          </KobalteDialog.Content>
        </KobalteDialog.Portal>
      </KobalteDialog>

      {/* Reset Password Dialog */}
      <KobalteDialog open={showResetPasswordDialog()} onOpenChange={setShowResetPasswordDialog}>
        <KobalteDialog.Portal>
          <KobalteDialog.Overlay class="fixed inset-0 bg-black/50" />
          <KobalteDialog.Content class="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-outline-dimmed bg-background-base p-6">
            <KobalteDialog.Title class="text-lg font-semibold">
              Reset Password: {editingUser()?.username}
            </KobalteDialog.Title>
            <KobalteDialog.Description class="mt-1 text-sm text-color-secondary">
              Set a new password for this user
            </KobalteDialog.Description>

            <div class="mt-4">
              <TextField
                label="New Password"
                type="password"
                value={newPasswordReset()}
                onChange={setNewPasswordReset}
                placeholder="Enter new password"
              />
            </div>

            <div class="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setShowResetPasswordDialog(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={resetPassword} disabled={!newPasswordReset()}>
                Reset Password
              </Button>
            </div>
          </KobalteDialog.Content>
        </KobalteDialog.Portal>
      </KobalteDialog>

      <KobalteDialog open={showProjectDialog()} onOpenChange={setShowProjectDialog}>
        <KobalteDialog.Portal>
          <KobalteDialog.Overlay class="fixed inset-0 bg-black/50" />
          <KobalteDialog.Content class="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-outline-dimmed bg-background-base p-6">
            <KobalteDialog.Title class="text-lg font-semibold">
              {editingProject()
                ? language.t("admin.projectDialog.editTitle", { project: editingProject()?.name || editingProject()?.directory || "" })
                : language.t("admin.projectDialog.addTitle")}
            </KobalteDialog.Title>
            <KobalteDialog.Description class="mt-1 text-sm text-color-secondary">
              {editingProject()
                ? language.t("admin.projectDialog.editDescription")
                : language.t("admin.projectDialog.addDescription")}
            </KobalteDialog.Description>

            <div class="mt-4 space-y-4">
              <TextField
                label={language.t("admin.projectDialog.displayName")}
                value={projectName()}
                onChange={setProjectName}
                placeholder={language.t("admin.projectDialog.displayNamePlaceholder")}
              />
              <div>
                <label class="block text-sm font-medium">{language.t("admin.projectDialog.description")}</label>
                <textarea
                  value={projectDescription()}
                  onInput={(e) => setProjectDescription(e.currentTarget.value)}
                  placeholder={language.t("admin.projectDialog.descriptionPlaceholder")}
                  rows={4}
                  class="mt-1 w-full rounded border border-outline-dimmed bg-background-input px-3 py-2 text-sm"
                />
              </div>
              <TextField label={language.t("admin.projectDialog.directory")} value={projectDirectory()} disabled />
            </div>

            <div class="mt-6 flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowProjectDialog(false)
                  setEditingProject(null)
                  setProjectDirectory("")
                  setProjectName("")
                  setProjectDescription("")
                }}
              >
                {language.t("common.cancel")}
              </Button>
              <Button variant="primary" onClick={saveProject} disabled={!projectDirectory()}>
                {editingProject() ? language.t("common.save") : language.t("admin.projectRegistry.add")}
              </Button>
            </div>
          </KobalteDialog.Content>
        </KobalteDialog.Portal>
      </KobalteDialog>
    </div>
  )
}
