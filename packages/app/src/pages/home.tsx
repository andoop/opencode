import { createMemo, For, Match, Show, Switch } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Logo } from "@opencode-ai/ui/logo"
import { useLayout } from "@/context/layout"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/util/encode"
import { Icon } from "@opencode-ai/ui/icon"
import { usePlatform } from "@/context/platform"
import { DateTime } from "luxon"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogSelectDirectory } from "@/components/dialog-select-directory"
import { DialogSelectProject } from "@/components/dialog-select-project"
import { DialogSelectServer } from "@/components/dialog-select-server"
import { useServer } from "@/context/server"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"
import { useAuth } from "@/context/auth"

export default function Home() {
  const sync = useGlobalSync()
  const layout = useLayout()
  const platform = usePlatform()
  const dialog = useDialog()
  const navigate = useNavigate()
  const server = useServer()
  const language = useLanguage()
  const auth = useAuth()
  const homedir = createMemo(() => sync.data.path.home)
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

  function openProject(directory: string) {
    layout.projects.open(directory)
    server.projects.touch(directory)
    navigate(`/${base64Encode(directory)}`)
  }

  async function chooseProject() {
    if (!auth.isAdmin) {
      dialog.show(() => <DialogSelectProject onSelect={(result) => result && openProject(result)} />)
      return
    }

    function resolve(result: string | string[] | null) {
      if (Array.isArray(result)) {
        for (const directory of result) {
          openProject(directory)
        }
      } else if (result) {
        openProject(result)
      }
    }

    if (platform.openDirectoryPickerDialog && server.isLocal()) {
      const result = await platform.openDirectoryPickerDialog?.({
        title: language.t("command.project.open"),
        multiple: true,
      })
      resolve(result)
    } else {
      dialog.show(
        () => <DialogSelectDirectory multiple={true} onSelect={resolve} />,
        () => resolve(null),
      )
    }
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
                {language.t("command.project.open")}
              </Button>
            </div>
            <ul class="flex flex-col gap-2">
              <For each={recent()}>
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
              {language.t("command.project.open")}
            </Button>
          </div>
        </Match>
      </Switch>
    </div>
  )
}
