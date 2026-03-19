import { Show } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Logo } from "@opencode-ai/ui/logo"
import { useLayout } from "@/context/layout"
import { useNavigate } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/util/encode"
import { Icon } from "@opencode-ai/ui/icon"
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

  function openProject(directory: string) {
    layout.projects.open(directory)
    server.projects.touch(directory)
    navigate(`/${base64Encode(directory)}`)
  }

  function createWorkspace(input: { directories: string[]; selected_group_ids: string[] } | null) {
    if (!input?.directories.length) return
    workspaceFetch<WorkspaceInfo>(globalSDK.url, "/workspace", {
      method: "POST",
      token: auth.token ?? undefined,
      fetchFn: fetch,
      body: JSON.stringify(input),
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
      <div class="mt-30 mx-auto flex flex-col items-center gap-3">
        <Icon name="folder-add-left" size="large" />
        <div class="text-14-medium text-text-strong">{language.t("workspace.new")}</div>
        <div />
        <Button class="px-3" onClick={chooseProject}>
          {language.t("workspace.new")}
        </Button>
      </div>
    </div>
  )
}
