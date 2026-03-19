import { Button } from "@opencode-ai/ui/button"
import { TextField } from "@opencode-ai/ui/text-field"
import { Dialog as KobalteDialog } from "@kobalte/core/dialog"
import { For, Show, createMemo, createResource, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import {
  DEFAULT_REGISTER_MODELS,
  FeatureMatrix,
  ModelWhitelist,
  createFeatures,
  createRegisteredFeatures,
  modelSummary,
  type FeatureState,
  type ProviderInfo,
  type UserInfo,
  useAdminCommon,
} from "./shared"

export default function AdminUsersPage() {
  const { auth, authHeaders, fetchFn, server } = useAdminCommon()
  const [error, setError] = createSignal<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = createSignal(false)
  const [showEditDialog, setShowEditDialog] = createSignal(false)
  const [showResetPasswordDialog, setShowResetPasswordDialog] = createSignal(false)
  const [editingUser, setEditingUser] = createSignal<UserInfo | null>(null)

  const [newUsername, setNewUsername] = createSignal("")
  const [newPassword, setNewPassword] = createSignal("")
  const [newEmail, setNewEmail] = createSignal("")
  const [newRole, setNewRole] = createSignal<"admin" | "user">("user")
  const [newPermissionLevel, setNewPermissionLevel] = createSignal<"full" | "readonly" | "custom">("custom")
  const [newCustomEdit, setNewCustomEdit] = createSignal<"allow" | "ask" | "deny">("allow")
  const [newCustomWrite, setNewCustomWrite] = createSignal<"allow" | "ask" | "deny">("allow")
  const [newCustomBash, setNewCustomBash] = createSignal<"allow" | "ask" | "deny">("ask")
  const [newCustomRead, setNewCustomRead] = createSignal<"allow" | "ask" | "deny">("allow")
  const [newFeatures, setNewFeatures] = createStore<FeatureState>(createRegisteredFeatures())
  const [newModels, setNewModels] = createSignal<string[] | null>([...DEFAULT_REGISTER_MODELS])
  const [newModelSearch, setNewModelSearch] = createSignal("")

  const [editRole, setEditRole] = createSignal<"admin" | "user">("user")
  const [editStatus, setEditStatus] = createSignal<"active" | "disabled">("active")
  const [editPermissionLevel, setEditPermissionLevel] = createSignal<"full" | "readonly" | "custom">("full")
  const [editCustomEdit, setEditCustomEdit] = createSignal<"allow" | "ask" | "deny">("allow")
  const [editCustomWrite, setEditCustomWrite] = createSignal<"allow" | "ask" | "deny">("allow")
  const [editCustomBash, setEditCustomBash] = createSignal<"allow" | "ask" | "deny">("ask")
  const [editCustomRead, setEditCustomRead] = createSignal<"allow" | "ask" | "deny">("allow")
  const [editFeatures, setEditFeatures] = createStore<FeatureState>(createFeatures())
  const [editModels, setEditModels] = createSignal<string[] | null>([])
  const [editModelSearch, setEditModelSearch] = createSignal("")
  const [newPasswordReset, setNewPasswordReset] = createSignal("")

  const fetchUsers = async () => {
    const response = await fetchFn(`${server.url}/user`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error("Failed to fetch users")
    return response.json() as Promise<UserInfo[]>
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
  const [providers] = createResource(fetchProviders)

  const toggleFeatures = (
    setFeatures: typeof setNewFeatures,
    id: "modes.ask" | "modes.build" | "modes.plan" | "files" | "models" | "providers" | "servers" | "mcp",
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
    <section class="space-y-6">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h2 class="text-xl font-semibold text-color-primary">用户管理</h2>
          <p class="mt-1 text-sm text-color-secondary">维护用户账号、角色、状态、功能权限和可用模型范围。</p>
        </div>
        <Button variant="primary" onClick={() => setShowCreateDialog(true)}>
          创建用户
        </Button>
      </div>

      <Show when={error()}>
        <div class="rounded-md bg-auxiliary-error/10 p-3">
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
                    <td class="px-4 py-3 text-sm text-color-secondary">{formatDate(user.time.last_login)}</td>
                    <td class="px-4 py-3">
                      <div class="flex gap-2">
                        <Button size="small" variant="ghost" onClick={() => openEditDialog(user)}>
                          Edit
                        </Button>
                        <Button size="small" variant="ghost" onClick={() => openResetPasswordDialog(user)}>
                          Reset Password
                        </Button>
                        <Show when={user.id !== auth.user?.id}>
                          <Button size="small" variant="secondary" onClick={() => deleteUser(user.id)}>
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

      <KobalteDialog open={showCreateDialog()} onOpenChange={setShowCreateDialog}>
        <KobalteDialog.Portal>
          <KobalteDialog.Overlay class="fixed inset-0 bg-black/50" />
          <KobalteDialog.Content class="fixed left-1/2 top-1/2 max-h-[90vh] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg border border-outline-dimmed bg-background-base p-6">
            <KobalteDialog.Title class="text-lg font-semibold">Create New User</KobalteDialog.Title>
            <KobalteDialog.Description class="mt-1 text-sm text-color-secondary">
              Add a new user to the system
            </KobalteDialog.Description>

            <div class="mt-4 space-y-4">
              <TextField label="Username" value={newUsername()} onChange={setNewUsername} placeholder="Enter username" />
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
                  onChange={(e) => setNewPermissionLevel(e.currentTarget.value as "full" | "readonly" | "custom")}
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

      <KobalteDialog open={showEditDialog()} onOpenChange={setShowEditDialog}>
        <KobalteDialog.Portal>
          <KobalteDialog.Overlay class="fixed inset-0 bg-black/50" />
          <KobalteDialog.Content class="fixed left-1/2 top-1/2 max-h-[90vh] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg border border-outline-dimmed bg-background-base p-6">
            <KobalteDialog.Title class="text-lg font-semibold">Edit User: {editingUser()?.username}</KobalteDialog.Title>
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
                  onChange={(e) => setEditPermissionLevel(e.currentTarget.value as "full" | "readonly" | "custom")}
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
    </section>
  )
}
