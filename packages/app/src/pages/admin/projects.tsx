import { Button } from "@opencode-ai/ui/button"
import { TextField } from "@opencode-ai/ui/text-field"
import { Dialog as KobalteDialog } from "@kobalte/core/dialog"
import { For, Show, createResource, createSignal } from "solid-js"
import { DialogSelectDirectory } from "@/components/dialog-select-directory"
import {
  DEFAULT_PROJECT_VISIBILITY,
  type GroupInfo,
  type RegistryProject,
  type UserInfo,
  useAdminCommon,
} from "./shared"

export default function AdminProjectsPage() {
  const { authHeaders, dialog, fetchFn, language, platform, readError, server } = useAdminCommon()
  const [error, setError] = createSignal<string | null>(null)
  const [showProjectDialog, setShowProjectDialog] = createSignal(false)
  const [showGroupDialog, setShowGroupDialog] = createSignal(false)
  const [editingProject, setEditingProject] = createSignal<RegistryProject | null>(null)
  const [editingGroup, setEditingGroup] = createSignal<GroupInfo | null>(null)

  const [projectDirectory, setProjectDirectory] = createSignal("")
  const [projectName, setProjectName] = createSignal("")
  const [projectDescription, setProjectDescription] = createSignal("")
  const [projectProfileMarkdown, setProjectProfileMarkdown] = createSignal("")
  const [projectGroupIDs, setProjectGroupIDs] = createSignal<string[]>([])
  const [projectVisibilityMode, setProjectVisibilityMode] = createSignal<RegistryProject["visibility"]["mode"]>("all")
  const [projectVisibilityUserIDs, setProjectVisibilityUserIDs] = createSignal<string[]>([])
  const [groupName, setGroupName] = createSignal("")
  const [groupDescription, setGroupDescription] = createSignal("")
  const [groupProfileMarkdown, setGroupProfileMarkdown] = createSignal("")

  const fetchProjects = async () => {
    const response = await fetchFn(`${server.url}/project/registry`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error("Failed to fetch projects")
    return response.json() as Promise<RegistryProject[]>
  }

  const fetchGroups = async () => {
    const response = await fetchFn(`${server.url}/project/group`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error("Failed to fetch groups")
    return response.json() as Promise<GroupInfo[]>
  }

  const fetchUsers = async () => {
    const response = await fetchFn(`${server.url}/user`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error("Failed to fetch users")
    return response.json() as Promise<UserInfo[]>
  }

  const [projects, { refetch: refetchProjects }] = createResource(fetchProjects)
  const [groups, { refetch: refetchGroups }] = createResource(fetchGroups)
  const [users] = createResource(fetchUsers)

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "Never"
    return new Date(timestamp).toLocaleString()
  }

  const projectVisibilityLabel = (project: RegistryProject) => {
    if (project.visibility.mode === "all") return "所有用户可见"
    if (project.visibility.mode === "include") return `仅 ${project.visibility.user_ids.length} 个用户可见`
    return `对 ${project.visibility.user_ids.length} 个用户隐藏`
  }

  const localizeProjectError = (message: string) => {
    const missingGit =
      /^No \.git directory was found in the selected path or its parent directories: (?<directory>.+)$/.exec(message)
    if (missingGit?.groups?.directory) {
      return language.t("admin.projectRegistry.error.notGit", {
        directory: missingGit.groups.directory,
      })
    }

    const onlyGit = /^Only git projects can be added to the project registry(?:: (?<directory>.+))?$/.exec(message)
    if (onlyGit?.groups?.directory) {
      return language.t("admin.projectRegistry.error.onlyGit", {
        directory: onlyGit.groups.directory,
      })
    }
    if (onlyGit) return language.t("admin.projectRegistry.error.onlyGitGeneric")
    return message
  }

  const resetProjectForm = () => {
    setEditingProject(null)
    setProjectDirectory("")
    setProjectName("")
    setProjectDescription("")
    setProjectProfileMarkdown("")
    setProjectGroupIDs([])
    setProjectVisibilityMode(DEFAULT_PROJECT_VISIBILITY.mode)
    setProjectVisibilityUserIDs(DEFAULT_PROJECT_VISIBILITY.user_ids)
  }

  const resetGroupForm = () => {
    setEditingGroup(null)
    setGroupName("")
    setGroupDescription("")
    setGroupProfileMarkdown("")
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
          profile_markdown: projectProfileMarkdown() || undefined,
          group_ids: projectGroupIDs(),
          visibility: {
            mode: projectVisibilityMode(),
            user_ids: projectVisibilityUserIDs(),
          },
        }),
      })
      if (!response.ok) {
        const message = localizeProjectError(
          await readError(response, language.t("admin.projectRegistry.error.addFailed")),
        )
        throw new Error(message)
      }
      setShowProjectDialog(false)
      resetProjectForm()
      void refetchProjects()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add project")
    }
  }

  const chooseProjectDirectory = async () => {
    const resolve = (result: string | string[] | null) => {
      const directory = Array.isArray(result) ? result[0] : result
      if (!directory) return
      setError(null)
      resetProjectForm()
      setProjectDirectory(directory)
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
    setError(null)
    setProjectDirectory(project.directory)
    setProjectName(project.name ?? "")
    setProjectDescription(project.description ?? "")
    setProjectProfileMarkdown(project.profile_markdown ?? "")
    setProjectGroupIDs(project.group_ids ?? [])
    setProjectVisibilityMode(project.visibility.mode)
    setProjectVisibilityUserIDs(project.visibility.user_ids)
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
          profile_markdown: projectProfileMarkdown() || undefined,
          group_ids: projectGroupIDs(),
          visibility: {
            mode: projectVisibilityMode(),
            user_ids: projectVisibilityUserIDs(),
          },
        }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || data.message || "Failed to update project")
      }
      setShowProjectDialog(false)
      resetProjectForm()
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

  const openGroupDialog = (group?: GroupInfo) => {
    setEditingGroup(group ?? null)
    setError(null)
    setGroupName(group?.name ?? "")
    setGroupDescription(group?.description ?? "")
    setGroupProfileMarkdown(group?.profile_markdown ?? "")
    setShowGroupDialog(true)
  }

  const saveGroup = async () => {
    setError(null)
    try {
      const editing = editingGroup()
      const url = editing ? `${server.url}/project/group/${editing.id}` : `${server.url}/project/group`
      const method = editing ? "PATCH" : "POST"
      const response = await fetchFn(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          name: groupName(),
          description: groupDescription() || undefined,
          profile_markdown: groupProfileMarkdown() || undefined,
        }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || data.message || "Failed to save group")
      }
      setShowGroupDialog(false)
      resetGroupForm()
      void refetchGroups()
      void refetchProjects()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save group")
    }
  }

  const deleteGroup = async (group: GroupInfo) => {
    if (!confirm(`Remove group ${group.name}?`)) return
    setError(null)
    try {
      const response = await fetchFn(`${server.url}/project/group/${group.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || data.message || "Failed to remove group")
      }
      void refetchGroups()
      void refetchProjects()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove group")
    }
  }

  return (
    <section class="space-y-10">
      <Show when={error()}>
        <div class="rounded-md bg-auxiliary-error/10 p-3">
          <p class="text-sm text-auxiliary-error">{error()}</p>
        </div>
      </Show>

      <div class="space-y-6">
        <div class="flex items-center justify-between gap-4">
          <div>
            <h2 class="text-xl font-semibold text-color-primary">分组管理</h2>
            <p class="mt-1 text-sm text-color-secondary">维护分组名称、描述和提供给 AI 感知的 Markdown profile。</p>
          </div>
          <Button variant="primary" onClick={() => openGroupDialog()}>
            新建分组
          </Button>
        </div>

        <Show when={groups.loading}>
          <p class="text-color-secondary">Loading groups...</p>
        </Show>

        <Show when={groups.error}>
          <p class="text-auxiliary-error">Failed to load groups</p>
        </Show>

        <Show when={groups()}>
          <div class="overflow-x-auto rounded-lg border border-outline-dimmed">
            <table class="min-w-[980px] w-full table-fixed">
              <thead class="border-b border-outline-dimmed bg-background-frame">
                <tr>
                  <th class="px-4 py-3 text-left text-sm font-medium">名称</th>
                  <th class="px-4 py-3 text-left text-sm font-medium">描述</th>
                  <th class="px-4 py-3 text-left text-sm font-medium">Profile</th>
                  <th class="px-4 py-3 text-left text-sm font-medium">创建时间</th>
                  <th class="px-4 py-3 text-left text-sm font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                <For each={groups()}>
                  {(group) => (
                    <tr class="border-b border-outline-dimmed last:border-0">
                      <td class="px-4 py-3">{group.name}</td>
                      <td class="px-4 py-3 text-sm text-color-secondary">
                        <div class="line-clamp-3 whitespace-pre-wrap break-words">{group.description || "-"}</div>
                      </td>
                      <td class="px-4 py-3 text-sm text-color-secondary">{group.profile_markdown ? "已配置" : "-"}</td>
                      <td class="px-4 py-3 text-sm text-color-secondary">{formatDate(group.time.created)}</td>
                      <td class="px-4 py-3">
                        <div class="flex gap-2">
                          <Button size="small" variant="ghost" onClick={() => openGroupDialog(group)}>
                            {language.t("common.edit")}
                          </Button>
                          <Button size="small" variant="secondary" onClick={() => void deleteGroup(group)}>
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
      </div>

      <div class="space-y-6">
        <div class="flex items-center justify-between gap-4">
          <div>
            <h2 class="text-xl font-semibold text-color-primary">{language.t("admin.projectRegistry.title")}</h2>
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
                  <th class="px-4 py-3 text-left text-sm font-medium">分组</th>
                  <th class="px-4 py-3 text-left text-sm font-medium">可见范围</th>
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
                      <td class="px-4 py-3 text-sm text-color-secondary">
                        <div class="line-clamp-3 whitespace-pre-wrap break-words">{project.groups.join(", ") || "未分组"}</div>
                      </td>
                      <td class="px-4 py-3 text-sm text-color-secondary">{projectVisibilityLabel(project)}</td>
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
      </div>

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
              <Show when={error()}>
                <div class="rounded-md bg-auxiliary-error/10 p-3">
                  <p class="text-sm text-auxiliary-error">{error()}</p>
                </div>
              </Show>
              <TextField
                label={language.t("admin.projectDialog.displayName")}
                value={projectName()}
                onChange={setProjectName}
                placeholder={language.t("admin.projectDialog.displayNamePlaceholder")}
              />
              <div>
                <label class="block text-sm font-medium">所属分组</label>
                <select
                  multiple
                  value={projectGroupIDs()}
                  onChange={(e) => {
                    const next = Array.from(e.currentTarget.selectedOptions).map((item) => item.value)
                    setProjectGroupIDs(next)
                  }}
                  class="mt-1 min-h-36 w-full rounded border border-outline-dimmed bg-background-input px-3 py-2 text-sm"
                >
                  <For each={groups() ?? []}>{(group) => <option value={group.id}>{group.name}</option>}</For>
                </select>
                <p class="mt-1 text-xs text-color-secondary">未选择任何分组时，项目会归到“未分组”。</p>
              </div>
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
              <div>
                <label class="block text-sm font-medium">项目 Profile Markdown</label>
                <textarea
                  value={projectProfileMarkdown()}
                  onInput={(e) => setProjectProfileMarkdown(e.currentTarget.value)}
                  placeholder="给 AI 感知的项目背景、术语、职责、边界和注意事项"
                  rows={8}
                  class="mt-1 w-full rounded border border-outline-dimmed bg-background-input px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label class="block text-sm font-medium">项目可见范围</label>
                <select
                  value={projectVisibilityMode()}
                  onChange={(e) => {
                    const mode = e.currentTarget.value as RegistryProject["visibility"]["mode"]
                    setProjectVisibilityMode(mode)
                    if (mode === "all") setProjectVisibilityUserIDs(DEFAULT_PROJECT_VISIBILITY.user_ids)
                  }}
                  class="mt-1 w-full rounded border border-outline-dimmed bg-background-input px-3 py-2 text-sm"
                >
                  <option value="all">所有用户可见</option>
                  <option value="include">仅指定用户可见</option>
                  <option value="exclude">对指定用户隐藏</option>
                </select>
              </div>
              <Show when={projectVisibilityMode() !== "all"}>
                <div>
                  <label class="block text-sm font-medium">
                    {projectVisibilityMode() === "include" ? "选择可见用户" : "选择隐藏用户"}
                  </label>
                  <select
                    multiple
                    value={projectVisibilityUserIDs()}
                    onChange={(e) => {
                      const next = Array.from(e.currentTarget.selectedOptions).map((item) => item.value)
                      setProjectVisibilityUserIDs(next)
                    }}
                    class="mt-1 min-h-36 w-full rounded border border-outline-dimmed bg-background-input px-3 py-2 text-sm"
                  >
                    <For each={users() ?? []}>{(user) => <option value={user.id}>{user.username}</option>}</For>
                  </select>
                  <p class="mt-1 text-xs text-color-secondary">按住 Command 或 Ctrl 可以多选。</p>
                </div>
              </Show>
              <TextField label={language.t("admin.projectDialog.directory")} value={projectDirectory()} disabled />
            </div>

            <div class="mt-6 flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowProjectDialog(false)
                  resetProjectForm()
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

      <KobalteDialog open={showGroupDialog()} onOpenChange={setShowGroupDialog}>
        <KobalteDialog.Portal>
          <KobalteDialog.Overlay class="fixed inset-0 bg-black/50" />
          <KobalteDialog.Content class="fixed left-1/2 top-1/2 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg border border-outline-dimmed bg-background-base p-6">
            <KobalteDialog.Title class="text-lg font-semibold">
              {editingGroup() ? `编辑分组：${editingGroup()?.name}` : "新建分组"}
            </KobalteDialog.Title>
            <KobalteDialog.Description class="mt-1 text-sm text-color-secondary">
              维护分组描述和提供给 AI 感知的 Markdown profile。
            </KobalteDialog.Description>

            <div class="mt-4 space-y-4">
              <Show when={error()}>
                <div class="rounded-md bg-auxiliary-error/10 p-3">
                  <p class="text-sm text-auxiliary-error">{error()}</p>
                </div>
              </Show>
              <TextField label="分组名称" value={groupName()} onChange={setGroupName} placeholder="例如：支付平台" />
              <div>
                <label class="block text-sm font-medium">分组描述</label>
                <textarea
                  value={groupDescription()}
                  onInput={(e) => setGroupDescription(e.currentTarget.value)}
                  placeholder="给用户看的分组摘要"
                  rows={4}
                  class="mt-1 w-full rounded border border-outline-dimmed bg-background-input px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label class="block text-sm font-medium">分组 Profile Markdown</label>
                <textarea
                  value={groupProfileMarkdown()}
                  onInput={(e) => setGroupProfileMarkdown(e.currentTarget.value)}
                  placeholder="给 AI 感知的分组背景、术语、职责边界、组内项目关系等"
                  rows={12}
                  class="mt-1 w-full rounded border border-outline-dimmed bg-background-input px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>

            <div class="mt-6 flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowGroupDialog(false)
                  resetGroupForm()
                }}
              >
                {language.t("common.cancel")}
              </Button>
              <Button variant="primary" onClick={saveGroup} disabled={!groupName().trim()}>
                {editingGroup() ? language.t("common.save") : "创建分组"}
              </Button>
            </div>
          </KobalteDialog.Content>
        </KobalteDialog.Portal>
      </KobalteDialog>
    </section>
  )
}
