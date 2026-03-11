import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Button } from "@opencode-ai/ui/button"
import { getFilename } from "@opencode-ai/util/path"
import { createMemo, createSignal, For, Show } from "solid-js"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"

export function DialogSelectProject(props: { title?: string; onSelect: (directory: string | null) => void }) {
  const dialog = useDialog()
  const sync = useGlobalSync()
  const language = useLanguage()
  const [query, setQuery] = createSignal("")
  const home = createMemo(() => sync.data.path.home)
  const projects = createMemo(() => {
    const text = query().trim().toLowerCase()
    return sync.data.project
      .filter((project) => !!project.worktree)
      .filter((project) => {
        if (!text) return true
        return (
          (project.name ?? "").toLowerCase().includes(text) ||
          project.worktree.toLowerCase().includes(text) ||
          getFilename(project.worktree).toLowerCase().includes(text)
        )
      })
      .slice()
      .sort((a, b) => (a.name ?? a.worktree).localeCompare(b.name ?? b.worktree))
  })

  const label = (directory: string) => {
    const base = home()
    if (!base) return directory
    if (directory === base) return "~"
    if (directory.startsWith(base + "/")) return "~" + directory.slice(base.length)
    return directory
  }

  const resolve = (directory: string | null) => {
    props.onSelect(directory)
    dialog.close()
  }

  return (
    <Dialog title={props.title ?? language.t("command.project.open")} class="!max-w-2xl">
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
            <div class="flex flex-col gap-1">
              <For each={projects()}>
                {(project) => (
                  <button
                    class="flex w-full flex-col items-start gap-1 rounded-md px-3 py-2 text-left hover:bg-surface-raised-base-hover"
                    onClick={() => resolve(project.worktree)}
                  >
                    <div class="text-14-medium text-text-strong">{project.name || getFilename(project.worktree)}</div>
                    <div class="text-12-regular text-text-weak">{label(project.worktree)}</div>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </Dialog>
  )
}
