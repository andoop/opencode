import { Show, createMemo } from "solid-js"
import { DateTime } from "luxon"
import { useSync } from "@/context/sync"
import { useLanguage } from "@/context/language"
import { Icon } from "@opencode-ai/ui/icon"
import { Button } from "@opencode-ai/ui/button"
import { getDirectory, getFilename } from "@opencode-ai/util/path"

interface NewSessionViewProps {
  worktree?: string
  onWorktreeChange?: (value: string) => void
  onCreate?: () => void
  creating?: boolean
}

export function NewSessionView(props: NewSessionViewProps) {
  const sync = useSync()
  const language = useLanguage()

  const projectRoot = createMemo(() => sync.project?.worktree ?? sync.data.path.directory)
  const currentBranch = createMemo(() => sync.data.vcs?.branch)

  return (
    <div
      class="size-full flex flex-col justify-end items-start gap-4 flex-[1_0_0] self-stretch max-w-200 mx-auto px-6"
      classList={{
        "pb-[calc(var(--prompt-height,11.25rem)+64px)]": !props.onCreate,
        "pb-16": !!props.onCreate,
      }}
    >
      <div class="text-20-medium text-text-weaker">{language.t("command.session.new")}</div>
      <div class="flex justify-center items-center gap-3">
        <Icon name="folder" size="small" />
        <div class="text-12-medium text-text-weak select-text">
          {getDirectory(projectRoot())}
          <span class="text-text-strong">{getFilename(projectRoot())}</span>
        </div>
      </div>
      <Show when={currentBranch()}>
        {(branch) => (
          <div class="flex justify-center items-center gap-1">
            <Icon name="branch" size="small" />
            <div class="text-12-medium text-text-weak select-text ml-2">
              {language.t("session.new.worktree.mainWithBranch", { branch: branch() })}
            </div>
          </div>
        )}
      </Show>
      <div class="text-12-regular text-text-weaker text-center max-w-[400px]">
        {language.t("session.new.autoWorktree")}
      </div>
      <Show when={sync.project}>
        {(project) => (
          <div class="flex justify-center items-center gap-3">
            <Icon name="pencil-line" size="small" />
            <div class="text-12-medium text-text-weak">
              {language.t("session.new.lastModified")}&nbsp;
              <span class="text-text-strong">
                {DateTime.fromMillis(project().time.updated ?? project().time.created)
                  .setLocale(language.locale())
                  .toRelative()}
              </span>
            </div>
          </div>
        )}
      </Show>
      <Show when={props.onCreate}>
        <Button size="large" icon="plus-small" class="mt-2" onClick={props.onCreate} loading={props.creating}>
          {language.t("command.session.new")}
        </Button>
      </Show>
    </div>
  )
}
