import { createMemo, For, Match, Show, Switch } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Logo } from "@opencode-ai/ui/logo"
import { useLayout } from "@/context/layout"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/util/encode"
import { Icon } from "@opencode-ai/ui/icon"
import { DateTime } from "luxon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogSelectProject } from "@/components/dialog-select-project"
import { DialogSelectServer } from "@/components/dialog-select-server"
import { useServer } from "@/context/server"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { useAuth } from "@/context/auth"
import { useGlobalSDK } from "@/context/global-sdk"
import { workspaceAsProject, workspaceFetch, type WorkspaceInfo } from "@/utils/workspace-api"

export default function Home() {
  const sync = useGlobalSync()
  const layout = useLayout()
  const dialog = useDialog()
  const navigate = useNavigate()
  const server = useServer()
  const language = useLanguage()
  const auth = useAuth()
  const globalSDK = useGlobalSDK()
  const homedir = createMemo(() => sync.data.path.home)
  const ungroupedLabel = "未分组"
  const recent = createMemo(() => {
    const allProjects = sync.data.project
    if (!auth.isAdmin) {
      return allProjects
        .slice()
        .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
        .slice(0, 5)
    }
    const openProjects = new Set(layout.projects.list().map((p) => p.worktree))
    const filtered = allProjects.filter((p) => openProjects.has(p.worktree))
    const sorted = filtered.toSorted((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
    return sorted.slice(0, 5)
  })
  const groupedRecent = createMemo(() => {
    const map = new Map<string, ReturnType<typeof recent>>()
    for (const project of recent()) {
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

  function openProject(directory: string) {
    layout.projects.open(directory)
    server.projects.touch(directory)
    navigate(`/${base64Encode(directory)}`)
  }

  function createWorkspace(directories: string[] | null) {
    if (!directories?.length) return
    workspaceFetch<WorkspaceInfo>(globalSDK.url, "/workspace", {
      method: "POST",
      token: auth.token ?? undefined,
      fetchFn: fetch,
      body: JSON.stringify({ directories }),
    })
      .then((workspace) => {
        sync.set("project", (prev) => [workspaceAsProject(workspace), ...prev.filter((item) => item.id !== workspace.id)])
        openProject(workspace.directory)
      })
      .catch(() => undefined)
  }

  async function chooseProject() {
    dialog.show(
      () => (
        <DialogSelectProject
          onSelect={(result) => {
            createWorkspace(result)
          }}
        />
      ),
    )
  }

  return (
    <div class="mx-auto mt-55 w-full md:w-auto px-4">
      <Logo class="md:w-xl opacity-12" />
      <Show when={auth.canFeature("servers")}>
        <Button
          size="large"
          variant="ghost"
          class="mt-4 mx-auto text-14-regular text-text-weak"
          onClick={() => dialog.show(() => <DialogSelectServer />)}
        >
          <div
            classList={{
              "size-2 rounded-full": true,
              "bg-icon-success-base": server.healthy() === true,
              "bg-icon-critical-base": server.healthy() === false,
              "bg-border-weak-base": server.healthy() === undefined,
            }}
          />
          {server.name}
        </Button>
      </Show>
      <Switch>
        <Match when={sync.data.project.length > 0}>
          <div class="mt-20 w-full flex flex-col gap-4">
            <div class="flex gap-2 items-center justify-between pl-3">
              <div class="text-14-medium text-text-strong">
                {language.t(auth.isAdmin ? "home.recentProjects" : "home.availableProjects")}
              </div>
              <Button icon="folder-add-left" size="normal" class="pl-2 pr-3" onClick={chooseProject}>
                {language.t("workspace.new")}
              </Button>
            </div>
            <div class="flex flex-col gap-4">
              <For each={groupedRecent()}>
                {(entry) => (
                  <div class="flex flex-col gap-2">
                    <div class="px-3 text-12-medium text-text-weak">{entry.group}</div>
                    <ul class="flex flex-col gap-2">
                      <For each={entry.projects}>
                        {(project) => (
                          <Button
                            size="large"
                            variant="ghost"
                            class="h-auto px-3 py-3 text-left"
                            onClick={() => openProject(project.worktree)}
                          >
                            <div class="min-w-0 flex-1">
                              <div class="truncate text-14-medium text-text-strong">{project.name || project.worktree.replace(homedir(), "~")}</div>
                              <Show when={project.description}>
                                <div class="mt-1 line-clamp-2 text-12-regular text-text-weak">{project.description}</div>
                              </Show>
                              <div class="mt-1 truncate text-12-regular text-text-weak">{project.worktree.replace(homedir(), "~")}</div>
                            </div>
                            <div class="ml-4 shrink-0 text-14-regular text-text-weak">
                              {DateTime.fromMillis(project.time.updated ?? project.time.created).toRelative()}
                            </div>
                          </Button>
                        )}
                      </For>
                    </ul>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Match>
        <Match when={true}>
          <div class="mt-30 mx-auto flex flex-col items-center gap-3">
            <Icon name="folder-add-left" size="large" />
            <div class="flex flex-col gap-1 items-center justify-center">
              <div class="text-14-medium text-text-strong">{language.t("home.empty.title")}</div>
              <div class="text-12-regular text-text-weak">
                {language.t(auth.isAdmin ? "home.empty.description" : "home.empty.descriptionRestricted")}
              </div>
            </div>
            <div />
            <Button class="px-3" onClick={chooseProject}>
              {language.t("workspace.new")}
            </Button>
          </div>
        </Match>
      </Switch>
    </div>
  )
}
