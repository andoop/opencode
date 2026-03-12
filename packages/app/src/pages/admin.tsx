import { createMemo, createSignal, createResource, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useNavigate } from "@solidjs/router"
import { FEATURE_DEFAULTS, useAuth } from "@/context/auth"
import { useServer } from "@/context/server"
import { usePlatform } from "@/context/platform"
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
  const dialog = useDialog()

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

  const [users, { refetch }] = createResource(fetchUsers)
  const [projects, { refetch: refetchProjects }] = createResource(fetchProjects)
  const [providers] = createResource(fetchProviders)
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
  const [newPermissionLevel, setNewPermissionLevel] = createSignal<"full" | "readonly" | "custom">("full")

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
  const [newFeatures, setNewFeatures] = createStore<FeatureState>(createFeatures())
  const [editFeatures, setEditFeatures] = createStore<FeatureState>(createFeatures())
  const [newModels, setNewModels] = createSignal<string[] | null>([])
  const [editModels, setEditModels] = createSignal<string[] | null>([])
  const [newModelSearch, setNewModelSearch] = createSignal("")
  const [editModelSearch, setEditModelSearch] = createSignal("")

  // Reset password form state
  const [newPasswordReset, setNewPasswordReset] = createSignal("")
  const [projectName, setProjectName] = createSignal("")

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
      setNewPermissionLevel("full")
      setNewCustomEdit("allow")
      setNewCustomWrite("allow")
      setNewCustomBash("ask")
      setNewCustomRead("allow")
      setNewFeatures(createFeatures())
      setNewModels([])
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
        }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || data.message || "Failed to add project")
      }
      void refetchProjects()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add project")
    }
  }

  const chooseProjectDirectory = async () => {
    const resolve = (result: string | string[] | null) => {
      const directory = Array.isArray(result) ? result[0] : result
      if (!directory) return
      void addProject(directory)
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
    setProjectName(project.name ?? "")
    setShowProjectDialog(true)
  }

  const updateProject = async () => {
    const project = editingProject()
    if (!project) return
    setError(null)
    try {
      const response = await fetchFn(`${server.url}/project/registry/${project.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          name: projectName(),
        }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || data.message || "Failed to update project")
      }
      setShowProjectDialog(false)
      setEditingProject(null)
      setProjectName("")
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

  return (
    <div class="mx-auto max-w-6xl p-8">
      <div class="mb-8 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-semibold text-color-primary">User Management</h1>
          <p class="mt-1 text-sm text-color-secondary">Manage users and their permissions</p>
        </div>
        <div class="flex gap-4">
          <Button variant="ghost" onClick={() => navigate("/")}>
            Back to Home
          </Button>
          <Button variant="primary" onClick={() => setShowCreateDialog(true)}>
            Create User
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
        <div class="rounded-lg border border-outline-dimmed">
          <table class="w-full">
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
          <h2 class="text-2xl font-semibold text-color-primary">Project Registry</h2>
          <p class="mt-1 text-sm text-color-secondary">Pre-register local projects that non-admin users are allowed to open</p>
        </div>
        <Button variant="primary" onClick={() => void chooseProjectDirectory()}>
          Add Project
        </Button>
      </div>

      <Show when={projects.loading}>
        <p class="text-color-secondary">Loading projects...</p>
      </Show>

      <Show when={projects.error}>
        <p class="text-auxiliary-error">Failed to load projects</p>
      </Show>

      <Show when={projects()}>
        <div class="rounded-lg border border-outline-dimmed">
          <table class="w-full">
            <thead class="border-b border-outline-dimmed bg-background-frame">
              <tr>
                <th class="px-4 py-3 text-left text-sm font-medium">Name</th>
                <th class="px-4 py-3 text-left text-sm font-medium">Directory</th>
                <th class="px-4 py-3 text-left text-sm font-medium">Added</th>
                <th class="px-4 py-3 text-left text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              <For each={projects()}>
                {(project) => (
                  <tr class="border-b border-outline-dimmed last:border-0">
                    <td class="px-4 py-3">{project.name || "-"}</td>
                    <td class="px-4 py-3 text-sm text-color-secondary">{project.directory}</td>
                    <td class="px-4 py-3 text-sm text-color-secondary">{formatDate(project.time.created)}</td>
                    <td class="px-4 py-3">
                      <div class="flex gap-2">
                        <Button size="small" variant="ghost" onClick={() => openProjectDialog(project)}>
                          Edit
                        </Button>
                        <Button size="small" variant="secondary" onClick={() => void deleteProject(project)}>
                          Delete
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
              Edit Project: {editingProject()?.name || editingProject()?.directory}
            </KobalteDialog.Title>
            <KobalteDialog.Description class="mt-1 text-sm text-color-secondary">
              Update the display name for this registered project
            </KobalteDialog.Description>

            <div class="mt-4 space-y-4">
              <TextField
                label="Display Name"
                value={projectName()}
                onChange={setProjectName}
                placeholder="Optional project name"
              />
              <TextField label="Directory" value={editingProject()?.directory ?? ""} disabled />
            </div>

            <div class="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setShowProjectDialog(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={updateProject}>
                Save Changes
              </Button>
            </div>
          </KobalteDialog.Content>
        </KobalteDialog.Portal>
      </KobalteDialog>
    </div>
  )
}
