import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { getFilename } from "@opencode-ai/util/path"
import { createEffect, createMemo, createSignal, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useGlobalSDK } from "@/context/global-sdk"
import { useAuth } from "@/context/auth"
import { usePlatform } from "@/context/platform"
import { workspaceFetch } from "@/utils/workspace-api"
import type { Project } from "@opencode-ai/sdk/v2/client"

type GroupInfo = {
  id: string
  name: string
  description?: string
}

type ProjectItem = Project & {
  group_ids?: string[]
}

type SelectionResult = {
  directories: string[]
  selected_group_ids: string[]
}

export function DialogSelectProject(props: {
  title?: string
  initialDirectories?: string[]
  lockedDirectories?: string[]
  onSelect: (value: SelectionResult | null) => void
}) {
  const dialog = useDialog()
  const language = useLanguage()
  const sdk = useGlobalSDK()
  const auth = useAuth()
  const platform = usePlatform()
  const [query, setQuery] = createSignal("")
  const [selected, setSelected] = createSignal<string[]>(props.initialDirectories ?? [])
  const [items, setItems] = createSignal<ProjectItem[]>([])
  const [groups, setGroups] = createSignal<GroupInfo[]>([])
  const home = createMemo(() => "")
  const ungroupedLabel = "未分组"
  const locked = createMemo(() => new Set(props.lockedDirectories ?? []))
  createEffect(() => {
    workspaceFetch<ProjectItem[]>(sdk.url, "/workspace/available-projects", {
      token: auth.token ?? undefined,
      fetchFn: platform.fetch ?? fetch,
    })
      .then(setItems)
      .catch(() => setItems([]))
    workspaceFetch<GroupInfo[]>(sdk.url, "/project/group", {
      token: auth.token ?? undefined,
      fetchFn: platform.fetch ?? fetch,
    })
      .then(setGroups)
      .catch(() => setGroups([]))
  })
  const projects = createMemo<ProjectItem[]>(() => {
    const text = query().trim().toLowerCase()
    return items()
      .filter((project) => !!project.worktree)
      .filter((project) => {
        if (!text) return true
        return (
          (project.name ?? "").toLowerCase().includes(text) ||
          (project.description ?? "").toLowerCase().includes(text) ||
          (project.groups ?? []).some((group) => group.toLowerCase().includes(text)) ||
          project.worktree.toLowerCase().includes(text) ||
          getFilename(project.worktree).toLowerCase().includes(text)
        )
      })
      .slice()
      .sort((a, b) => (a.name ?? a.worktree).localeCompare(b.name ?? b.worktree))
  })
  const groupedProjects = createMemo(() => {
    const all = projects()
    const known = new Map(
      groups().map((group) => [group.id, { id: group.id, name: group.name, description: group.description }]),
    )
    for (const project of all) {
      project.group_ids?.forEach((id, index) => {
        if (known.has(id)) return
        known.set(id, {
          id,
          name: project.groups?.[index] || "未命名分组",
          description: undefined,
        })
      })
    }
    const result = [...known.values()]
      .map((group) => ({
        id: group.id,
        group: group.name,
        description: group.description,
        projects: all.filter((project) => project.group_ids?.includes(group.id)),
      }))
      .filter((item) => item.projects.length > 0)
      .sort((a, b) => a.group.localeCompare(b.group))
    const ungrouped = all.filter((project) => !project.group_ids?.length)
    if (ungrouped.length > 0) {
      result.push({
        id: "",
        group: ungroupedLabel,
        description: undefined,
        projects: ungrouped,
      })
    }
    return result
  })

  const label = (directory: string) => {
    const base = home()
    if (!base) return directory
    if (directory === base) return "~"
    if (directory.startsWith(base + "/")) return "~" + directory.slice(base.length)
    return directory
  }

  const resolve = (value: SelectionResult | null) => {
    props.onSelect(value)
    dialog.close()
  }

  const submit = () => {
    const directories = selected()
    if (directories.length === 0) {
      resolve(null)
      return
    }
    const selectedGroups = groupedProjects()
      .filter((entry) => entry.id)
      .filter((entry) => entry.projects.every((project) => directories.includes(project.worktree)))
      .flatMap((entry) => (entry.id ? [entry.id] : []))
    resolve({
      directories,
      selected_group_ids: selectedGroups,
    })
  }

  const toggle = (directory: string) => {
    if (locked().has(directory)) return
    setSelected((prev) => (prev.includes(directory) ? prev.filter((item) => item !== directory) : [...prev, directory]))
  }

  const toggleGroup = (directories: string[]) => {
    setSelected((prev) => {
      const editable = directories.filter((directory) => !locked().has(directory))
      const allSelected = editable.every((directory) => prev.includes(directory))
      if (allSelected) return prev.filter((item) => !editable.includes(item))
      return Array.from(new Set([...prev, ...directories]))
    })
  }

  return (
    <Dialog title={props.title ?? language.t("workspace.new")} class="!max-w-2xl">
      <div class="flex h-[480px] flex-col gap-3">
        <div class="flex items-center gap-2">
          <input
            type="text"
            value={query()}
            placeholder={language.t("home.availableProjects")}
            onInput={(e) => setQuery(e.currentTarget.value)}
            class="flex-1 rounded-md border border-border-base bg-background-base px-3 py-2 text-14-regular text-text-strong focus:outline-none focus:ring-2 focus:ring-border-strong-base"
          />
          <Button variant="ghost" onClick={() => resolve(null)}>
            {language.t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={selected().length === 0}>
            确认
          </Button>
        </div>
        <div class="flex-1 overflow-y-auto rounded-md border border-border-base bg-background-frame p-2">
          <Show
            when={projects().length > 0}
            fallback={
              <div class="flex h-full items-center justify-center text-12-regular text-text-weak">
                {language.t("home.empty.descriptionRestricted")}
              </div>
            }
          >
            <div class="flex flex-col gap-3">
              <For each={groupedProjects()}>
                {(entry) => {
                  const directories = () => entry.projects.map((project) => project.worktree)
                  const selectedCount = () => directories().filter((directory) => selected().includes(directory)).length
                  return (
                    <div class="flex flex-col gap-1">
                      <button
                        class="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-surface-raised-base-hover"
                        onClick={() => toggleGroup(directories())}
                      >
                        <div class="min-w-0">
                          <div class="text-12-medium text-text-weak">{entry.group}</div>
                          <Show when={entry.description}>
                            <div class="mt-1 line-clamp-2 text-12-regular text-text-weak">{entry.description}</div>
                          </Show>
                        </div>
                        <div class="text-12-regular text-text-weak">
                          {selectedCount() === entry.projects.length ? "取消整组" : "选择整组"}
                          {selectedCount() > 0 ? ` (${selectedCount()}/${entry.projects.length})` : ""}
                        </div>
                      </button>
                      <div class="flex flex-col gap-1 pl-2">
                        <For each={entry.projects}>
                          {(project) => (
                            <button
                              class="flex w-full flex-col items-start gap-1 rounded-md px-3 py-2 text-left hover:bg-surface-raised-base-hover"
                              onClick={() => toggle(project.worktree)}
                            >
                              <div class="flex w-full items-center justify-between gap-3">
                                <div class="text-14-medium text-text-strong">
                                  {project.name || getFilename(project.worktree)}
                                </div>
                                <Show when={selected().includes(project.worktree)}>
                                  <div class="text-12-regular text-text-weak">
                                    {locked().has(project.worktree) ? "已在工作区" : "Selected"}
                                  </div>
                                </Show>
                              </div>
                              <Show when={project.description}>
                                <div class="line-clamp-2 text-12-regular text-text-weak">{project.description}</div>
                              </Show>
                              <div class="text-12-regular text-text-weak">{label(project.worktree)}</div>
                            </button>
                          )}
                        </For>
                      </div>
                    </div>
                  )
                }}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </Dialog>
  )
}
