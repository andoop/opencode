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

export function DialogSelectProject(props: { title?: string; onSelect: (directory: string[] | null) => void }) {
  const dialog = useDialog()
  const language = useLanguage()
  const sdk = useGlobalSDK()
  const auth = useAuth()
  const platform = usePlatform()
  const [query, setQuery] = createSignal("")
  const [selected, setSelected] = createSignal<string[]>([])
  const [items, setItems] = createSignal<Project[]>([])
  const home = createMemo(() => "")
  const ungroupedLabel = "未分组"
  createEffect(() => {
    workspaceFetch<Project[]>(sdk.url, "/workspace/available-projects", {
      token: auth.token ?? undefined,
      fetchFn: platform.fetch ?? fetch,
    })
      .then(setItems)
      .catch(() => setItems([]))
  })
  const projects = createMemo(() => {
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
    const map = new Map<string, Project[]>()
    for (const project of projects()) {
      const groups = project.groups?.length ? project.groups : [ungroupedLabel]
      for (const group of groups) {
        const list = map.get(group) ?? []
        list.push(project)
        map.set(group, list)
      }
    }
    return [...map.entries()]
      .sort(([a], [b]) => {
        if (a === ungroupedLabel) return 1
        if (b === ungroupedLabel) return -1
        return a.localeCompare(b)
      })
      .map(([group, projects]) => ({ group, projects }))
  })

  const label = (directory: string) => {
    const base = home()
    if (!base) return directory
    if (directory === base) return "~"
    if (directory.startsWith(base + "/")) return "~" + directory.slice(base.length)
    return directory
  }

  const resolve = (value: string[] | null) => {
    props.onSelect(value)
    dialog.close()
  }

  const submit = () => {
    resolve(selected().length ? selected() : null)
  }

  const toggle = (directory: string) => {
    setSelected((prev) => (prev.includes(directory) ? prev.filter((item) => item !== directory) : [...prev, directory]))
  }

  const toggleGroup = (directories: string[]) => {
    setSelected((prev) => {
      const allSelected = directories.every((directory) => prev.includes(directory))
      if (allSelected) return prev.filter((item) => !directories.includes(item))
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
                        <div class="text-12-medium text-text-weak">{entry.group}</div>
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
                                <div class="text-14-medium text-text-strong">{project.name || getFilename(project.worktree)}</div>
                                <Show when={selected().includes(project.worktree)}>
                                  <div class="text-12-regular text-text-weak">Selected</div>
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
