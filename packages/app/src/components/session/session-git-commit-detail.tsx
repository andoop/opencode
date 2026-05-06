import { SessionReview, type SessionReviewDiffStyle } from "@opencode-ai/ui/session-review"
import { Show, createEffect, createMemo, For } from "solid-js"
import { createStore } from "solid-js/store"
import type { GitCommitDetail } from "@opencode-ai/sdk/v2"
import type { SessionGitRef } from "./session-git-history-tab"

export type SessionGitCommitDetailValue = GitCommitDetail

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
  const [store, setStore] = createStore({
    open: [] as string[],
  })
  const diffs = createMemo(() => props.commit?.diffs ?? [])

  createEffect(() => {
    const commit = props.commit
    if (!commit) {
      setStore("open", [])
      return
    }

    setStore("open", commit.diffs.length > 10 ? [] : commit.diffs.map((item) => item.file))
  })

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
                            {commit()
                              .parents.map((item) => item.slice(0, 7))
                              .join(", ")}
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
                  <div
                    class="mt-2 max-h-20 overflow-y-auto rounded-md border border-border-base bg-background-frame px-2.5 py-2 text-12-regular text-text-weak"
                    data-scrollable
                  >
                    {commit().body}
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
                  open={store.open}
                  onOpenChange={(open) => setStore("open", open)}
                  onViewFile={props.onViewFile}
                  classes={{
                    root: "min-h-0 flex-1",
                    header: "px-4",
                    container: "px-4",
                  }}
                />
              </Show>
            </div>
          )}
        </Show>
      </Show>
    </div>
  )
}
