import { SessionReview, type SessionReviewDiffStyle } from "@opencode-ai/ui/session-review"
import { Button } from "@opencode-ai/ui/button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { checksum } from "@opencode-ai/util/encode"
import { Show, createEffect, createMemo, createSignal, For } from "solid-js"
import { createStore } from "solid-js/store"
import type { FileDiff, GitCommitDetail, GitCommitFile } from "@opencode-ai/sdk/v2"
import type { SessionGitRef } from "./session-git-history-tab"

export type SessionGitCommitFile = GitCommitFile
export type SessionGitCommitDetailValue = GitCommitDetail

function diffId(file: string) {
  const sum = checksum(file)
  if (!sum) return
  return `session-review-diff-${sum}`
}

function detailTime(input: number) {
  if (!input) return ""
  return new Date(input).toLocaleString()
}

function refClass(kind: SessionGitRef["kind"]) {
  if (kind === "head") return "border-transparent bg-icon-success-base text-text-invert-base"
  if (kind === "tag") return "border-transparent bg-auxiliary-warning/20 text-auxiliary-warning"
  if (kind === "remote") return "border-transparent bg-surface-info-base/20 text-text-strong"
  return "border-border-base bg-background-frame text-text-weak"
}

const tooltipClass =
  "max-w-none rounded-xl border border-border-base bg-background-base px-0 py-0 text-text-strong shadow-lg"

export function SessionGitCommitDetail(props: {
  commit?: SessionGitCommitDetailValue
  loading?: boolean
  loadingLabel: string
  emptyLabel: string
  authorLabel: string
  dateLabel: string
  parentsLabel: string
  filesLabel: string
  noDiffLabel: string
  openFileLabel: string
  diffStyle: SessionReviewDiffStyle
  onDiffStyleChange: (style: SessionReviewDiffStyle) => void
  onViewFile?: (path: string) => void
}) {
  let reviewScroll: HTMLDivElement | undefined
  const [store, setStore] = createStore({
    open: [] as string[],
  })
  const [focusedFile, setFocusedFile] = createSignal<string>()
  const [pendingFile, setPendingFile] = createSignal<string>()

  const files = createMemo(() => props.commit?.files ?? [])
  const diffs = createMemo(() => props.commit?.diffs ?? [])

  createEffect(() => {
    const commit = props.commit
    if (!commit) {
      setStore("open", [])
      setFocusedFile(undefined)
      setPendingFile(undefined)
      return
    }

    setStore("open", commit.diffs.length > 10 ? [] : commit.diffs.map((item) => item.file))
    setFocusedFile(undefined)
    setPendingFile(undefined)
  })

  createEffect(() => {
    const file = pendingFile()
    const root = reviewScroll
    if (!file || !root) return

    const targetID = diffId(file)
    if (!targetID) return

    const attempt = (count: number) => {
      if (pendingFile() !== file) return
      if (!reviewScroll) return
      if (count > 60) {
        setPendingFile(undefined)
        return
      }

      const node = document.getElementById(targetID)
      if (!(node instanceof HTMLElement) || !reviewScroll.contains(node)) {
        requestAnimationFrame(() => attempt(count + 1))
        return
      }

      const a = node.getBoundingClientRect()
      const b = reviewScroll.getBoundingClientRect()
      const top = a.top - b.top + reviewScroll.scrollTop
      reviewScroll.scrollTo({ top, behavior: "auto" })
      setPendingFile(undefined)
    }

    requestAnimationFrame(() => attempt(0))
  })

  const focusFile = (path: string) => {
    if (!store.open.includes(path)) {
      setStore("open", [...store.open, path])
    }
    setFocusedFile(path)
    setPendingFile(path)
  }

  return (
    <div class="flex h-full min-h-0 flex-col overflow-hidden bg-background-stronger contain-strict">
      <Show
        when={!props.loading}
        fallback={
          <div class="flex flex-1 items-center justify-center px-6 text-center text-12-regular text-text-weak">
            {props.loadingLabel}
          </div>
        }
      >
        <Show
          when={props.commit}
          fallback={
            <div class="flex flex-1 items-center justify-center px-6 text-center text-12-regular text-text-weak">
              {props.emptyLabel}
            </div>
          }
        >
          {(commit) => (
            <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div class="border-b border-border-weak-base bg-background-base px-4 py-2.5">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-14-medium text-text-strong">{commit().subject || commit().short}</div>
                    <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-11-regular text-text-weaker">
                      <span class="font-mono text-text-weak">{commit().short}</span>
                      <span>
                        {props.authorLabel}: <span class="text-text-strong">{commit().author_name}</span>
                      </span>
                      <span>
                        {props.dateLabel}: <span class="text-text-strong">{detailTime(commit().authored_at)}</span>
                      </span>
                      <Show when={commit().parents.length > 0}>
                        <span>
                          {props.parentsLabel}:{" "}
                          <span class="font-mono text-text-strong">
                            {commit().parents.map((item) => item.slice(0, 7)).join(", ")}
                          </span>
                        </span>
                      </Show>
                    </div>
                  </div>
                </div>

                <Show when={commit().refs.length > 0}>
                  <div class="mt-2 flex flex-wrap gap-1">
                    <For each={commit().refs}>
                      {(ref) => (
                        <span
                          class={`inline-flex h-5 items-center rounded border px-1.5 text-[10px] font-medium ${refClass(ref.kind)}`}
                        >
                          {ref.name}
                        </span>
                      )}
                    </For>
                  </div>
                </Show>

                <Show when={commit().body}>
                  <div class="mt-2 max-h-20 overflow-y-auto rounded-md border border-border-base bg-background-frame px-2.5 py-2 text-12-regular text-text-weak" data-scrollable>
                    {commit().body}
                  </div>
                </Show>
              </div>

              <div class="flex min-h-0 flex-1 overflow-hidden">
                <div class="flex h-full w-[280px] shrink-0 flex-col border-r border-border-weak-base bg-background-base">
                  <div class="flex items-center justify-between border-b border-border-weak-base px-3 py-2">
                    <div class="text-12-medium text-text-strong">{props.filesLabel}</div>
                    <div class="text-11-regular text-text-weaker">{files().length}</div>
                  </div>
                  <Show
                    when={files().length > 0}
                    fallback={
                      <div class="flex flex-1 items-center justify-center px-4 text-center text-12-regular text-text-weak">
                        {props.noDiffLabel}
                      </div>
                    }
                  >
                    <div class="min-h-0 flex-1 overflow-y-auto p-2" data-scrollable>
                      <For each={files()}>
                        {(file) => (
                          <div class="mb-1 rounded-md border border-border-base bg-background-frame px-2 py-1.5">
                            <Tooltip
                              placement="right-start"
                              contentClass={tooltipClass}
                              value={
                                <div class="flex w-[320px] max-w-[320px] flex-col">
                                  <div class="border-b border-border-weak-base px-3 py-2">
                                    <div class="text-12-medium text-text-strong">Changed file</div>
                                    <div class="mt-1 break-all text-11-regular text-text-weaker">{file.path}</div>
                                  </div>
                                  <div class="grid grid-cols-3 gap-2 p-3">
                                    <div>
                                      <div class="text-[11px] font-medium text-text-weaker">Status</div>
                                      <div class="mt-0.5 text-12-medium text-text-strong">{file.status}</div>
                                    </div>
                                    <div>
                                      <div class="text-[11px] font-medium text-text-weaker">Added</div>
                                      <div class="mt-0.5 text-12-medium text-text-strong">+{file.additions}</div>
                                    </div>
                                    <div>
                                      <div class="text-[11px] font-medium text-text-weaker">Deleted</div>
                                      <div class="mt-0.5 text-12-medium text-text-strong">-{file.deletions}</div>
                                    </div>
                                  </div>
                                </div>
                              }
                            >
                              <button
                                type="button"
                                class="w-full truncate text-left text-12-medium text-text-strong hover:text-text-base"
                                onClick={() => focusFile(file.path)}
                              >
                                {file.path}
                              </button>
                            </Tooltip>
                            <div class="mt-1 flex items-center justify-between gap-2 text-11-regular text-text-weaker">
                              <span class="truncate">{file.status}</span>
                              <span class="shrink-0">
                                +{file.additions} -{file.deletions}
                              </span>
                            </div>
                            <Show when={props.onViewFile}>
                              <div class="mt-1">
                                <Button variant="ghost" size="small" class="h-6 px-1.5" onClick={() => props.onViewFile?.(file.path)}>
                                  {props.openFileLabel}
                                </Button>
                              </div>
                            </Show>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>

                <Show
                  when={diffs().length > 0}
                  fallback={
                    <div class="flex flex-1 items-center justify-center px-6 text-center text-12-regular text-text-weak">
                      {props.noDiffLabel}
                    </div>
                  }
                >
                  <SessionReview
                    diffs={diffs()}
                    diffStyle={props.diffStyle}
                    onDiffStyleChange={props.onDiffStyleChange}
                    focusedFile={focusedFile()}
                    open={store.open}
                    onOpenChange={(open) => setStore("open", open)}
                    scrollRef={(el) => {
                      reviewScroll = el
                    }}
                    onViewFile={props.onViewFile}
                    classes={{
                      root: "min-h-0 flex-1",
                      header: "px-4",
                      container: "px-4",
                    }}
                  />
                </Show>
              </div>
            </div>
          )}
        </Show>
      </Show>
    </div>
  )
}
