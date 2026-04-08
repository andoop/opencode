import { Button } from "@opencode-ai/ui/button"
import { Select } from "@opencode-ai/ui/select"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import type { GitHistoryEntry, GitRef } from "@opencode-ai/sdk/v2"
import { For, Show, createMemo } from "solid-js"

export type SessionGitRef = GitRef
export type SessionGitHistoryEntry = GitHistoryEntry
export type SessionGitHistoryProject = {
  id: string
  label: string
}
export type SessionGitWorkingTree = {
  id: string
  label: string
  summary: string
  files: number
  selected?: boolean
}
type GraphRow = {
  lane: number
  before: number[]
  after: number[]
  parents: number[]
  width: number
}

function historyTime(input: number) {
  if (!input) return ""
  return new Date(input).toLocaleString()
}

function historyTimeAgo(input: number) {
  if (!input) return ""
  const diff = input - Date.now()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  const week = 7 * day
  const month = 30 * day
  const year = 365 * day
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

  if (Math.abs(diff) < hour) return format.format(Math.round(diff / minute), "minute")
  if (Math.abs(diff) < day) return format.format(Math.round(diff / hour), "hour")
  if (Math.abs(diff) < week) return format.format(Math.round(diff / day), "day")
  if (Math.abs(diff) < month) return format.format(Math.round(diff / week), "week")
  if (Math.abs(diff) < year) return format.format(Math.round(diff / month), "month")
  return format.format(Math.round(diff / year), "year")
}

function refClass(kind: SessionGitRef["kind"]) {
  if (kind === "head") return "border-transparent bg-icon-success-base text-text-invert-base"
  if (kind === "tag") return "border-transparent bg-auxiliary-warning/20 text-auxiliary-warning"
  if (kind === "remote") return "border-transparent bg-surface-info-base/20 text-text-strong"
  return "border-border-base bg-background-frame text-text-weak"
}

function refLabel(kind: SessionGitRef["kind"]) {
  if (kind === "head") return "HEAD"
  if (kind === "tag") return "Tag"
  if (kind === "remote") return "Remote"
  return "Branch"
}

const tooltipClass =
  "max-w-none rounded-xl border border-border-base bg-background-base px-0 py-0 text-text-strong shadow-lg"

function graphRows(items: SessionGitHistoryEntry[]) {
  const lanes: Array<string | undefined> = []
  const rows: GraphRow[] = []
  let width = 1
  const active = (input: Array<string | undefined>) =>
    input.flatMap((value, index) => (value ? [index] : []))
  const extent = (input: number[]) => (input.length > 0 ? Math.max(...input) + 1 : 0)
  const trim = (input: Array<string | undefined>) => {
    let end = input.length
    while (end > 0 && !input[end - 1]) end -= 1
    return input.slice(0, end)
  }

  for (const item of items) {
    let lane = lanes.indexOf(item.oid)
    if (lane === -1) {
      const empty = lanes.findIndex((value) => !value)
      lane = empty >= 0 ? empty : lanes.length
      lanes[lane] = item.oid
    }

    const before = active(lanes)
    let next = [...lanes]

    if (item.parents.length === 0) {
      next[lane] = undefined
    } else {
      next[lane] = item.parents[0]!
      for (const parent of item.parents.slice(1)) {
        if (next.includes(parent)) continue
        const empty = next.findIndex((value, index) => !value && index > lane)
        if (empty >= 0) {
          next[empty] = parent
          continue
        }
        next.splice(lane + 1, 0, parent)
      }

      const seen = new Set<string>()
      next = next.map((value) => {
        if (!value) return value
        if (seen.has(value)) return undefined
        seen.add(value)
        return value
      })
    }

    next = trim(next)
    const after = active(next)
    const parents = item.parents.map((parent) => next.indexOf(parent)).filter((index) => index >= 0)
    const rowWidth = Math.max(extent(before), extent(after), lane + 1, ...parents.map((index) => index + 1))

    width = Math.max(width, rowWidth)
    rows.push({
      lane,
      before,
      after,
      parents,
      width: rowWidth,
    })
    lanes.splice(0, lanes.length, ...next)
  }

  return { rows, width }
}

export function SessionGitHistoryTab(props: {
  commits: SessionGitHistoryEntry[]
  workingTree?: SessionGitWorkingTree
  projects?: SessionGitHistoryProject[]
  currentProject?: string
  currentProjectLabel?: string
  currentBranch?: string
  trackingBranch?: string
  currentCommit?: SessionGitHistoryEntry
  selected?: string
  loading?: boolean
  loadingMore?: boolean
  hasMore?: boolean
  empty: string
  loadingLabel: string
  loadMoreLabel: string
  title: string
  projectLabel?: string
  refreshLabel?: string
  currentBranchLabel?: string
  trackingBranchLabel?: string
  currentCommitLabel?: string
  onSelect: (oid: string) => void
  onSelectProject?: (id: string) => void
  onLoadMore?: () => void
  onRefresh?: () => void
}) {
  const graph = createMemo(() => graphRows(props.commits))
  const laneWidth = 14
  const rowHeight = 68
  const graphOffset = 12
  const centerY = rowHeight / 2
  const columns = createMemo(() => Math.max(2, graph().width))
  const graphWidth = createMemo(() => columns() * laneWidth + 16)
  const laneX = (lane: number) => lane * laneWidth + laneWidth / 2 + 8
  const headerBranchValue = createMemo(() => props.currentBranch || "-")
  const hasWorkingTree = createMemo(() => !!props.workingTree)
  const commitRow = (index: number) => index + (hasWorkingTree() ? 1 : 0)
  const rowTop = (row: number) => row * rowHeight
  const rowCenter = (row: number) => rowTop(row) + centerY
  const rowBottom = (row: number) => rowTop(row) + rowHeight
  const totalRows = createMemo(() => props.commits.length + (hasWorkingTree() ? 1 : 0))
  const graphHeight = createMemo(() => totalRows() * rowHeight)
  const headIndex = createMemo(() => props.commits.findIndex((item) => item.refs.some((ref) => ref.kind === "head")))
  const workingTreeLane = createMemo(() => {
    const index = headIndex()
    if (index < 0) return 0
    return graph().rows[index]?.lane ?? 0
  })
  const graphColumnWidth = createMemo(() => graphOffset + graphWidth() + 8)
  const contentMinWidth = createMemo(() => `${graphColumnWidth() + 760}px`)
  const rowClass =
    "group grid h-[68px] w-full items-stretch gap-0 border-b border-border-weak-base text-left transition-colors hover:bg-surface-raised-base-hover"
  const rowGridStyle = createMemo(() => ({
    "grid-template-columns": `${graphColumnWidth()}px minmax(0, 1fr) 110px 90px`,
  }))

  return (
    <div class="flex h-full min-h-0 flex-col bg-background-base">
      <div class="flex items-center justify-between gap-2 border-b border-border-weak-base px-3 py-2">
        <div class="min-w-0 flex flex-col gap-1">
          <div class="flex min-w-0 items-center gap-2">
            <div class="text-12-medium text-text-strong">{props.title}</div>
            <div class="text-11-regular text-text-weaker">{props.commits.length + (props.workingTree ? 1 : 0)}</div>
          </div>
          <div class="flex min-w-0 items-center gap-1.5 text-11-regular text-text-weaker">
            <Show when={props.currentProjectLabel}>
              <span class="truncate">{props.currentProjectLabel}</span>
              <span aria-hidden="true">·</span>
            </Show>
            <Tooltip
              placement="bottom-start"
              contentClass={tooltipClass}
              value={
                <div class="flex w-[320px] max-w-[320px] flex-col">
                  <div class="border-b border-border-weak-base px-3 py-2">
                    <div class="text-12-medium text-text-strong">Git</div>
                    <div class="text-11-regular text-text-weaker">{props.currentProjectLabel || props.title}</div>
                  </div>
                  <div class="flex flex-col gap-2 p-3">
                    <div>
                      <div class="text-[11px] font-medium text-text-weaker">{props.currentBranchLabel || "Current branch"}</div>
                      <div class="mt-0.5 break-all font-mono text-12-medium text-text-strong">{props.currentBranch || "-"}</div>
                    </div>
                  <Show when={props.trackingBranch}>
                    <div>
                      <div class="text-[11px] font-medium text-text-weaker">{props.trackingBranchLabel || "Tracking remote"}</div>
                      <div class="mt-0.5 break-all font-mono text-12-medium text-text-strong">{props.trackingBranch}</div>
                    </div>
                  </Show>
                  <Show when={props.currentCommit}>
                    <div>
                      <div class="text-[11px] font-medium text-text-weaker">{props.currentCommitLabel || "Current commit"}</div>
                      <div class="mt-0.5 font-mono text-11-regular text-text-weaker">{props.currentCommit?.short}</div>
                      <div class="mt-0.5 break-words text-12-medium text-text-strong">{props.currentCommit?.subject || props.currentCommit?.short}</div>
                    </div>
                  </Show>
                  </div>
                </div>
              }
              inactive={!props.currentBranch && !props.trackingBranch && !props.currentCommit}
            >
              <span class="inline-flex min-w-0 max-w-[280px] items-center rounded border border-border-base bg-background-frame px-1.5 py-0.5 font-mono text-[10px] text-text-strong">
                <span class="truncate">{headerBranchValue()}</span>
              </span>
            </Tooltip>
          </div>
        </div>
        <div class="flex items-center gap-1">
          <Show when={(props.projects?.length ?? 0) > 1}>
            <Select
              options={props.projects ?? []}
              current={(props.projects ?? []).find((item) => item.id === props.currentProject)}
              value={(item) => item.id}
              label={(item) => item.label}
              onSelect={(item) => item && props.onSelectProject?.(item.id)}
              variant="ghost"
              class="max-w-[170px]"
              valueClass="truncate"
              aria-label={props.projectLabel}
            />
          </Show>
          <Show when={props.onRefresh}>
            <Button
              variant="ghost"
              class="h-7 px-2 text-11-medium"
              onClick={() => props.onRefresh?.()}
              aria-label={props.refreshLabel || "Refresh"}
            >
              {props.refreshLabel || "Refresh"}
            </Button>
          </Show>
        </div>
      </div>

      <Show
        when={!props.loading}
        fallback={
          <div class="flex flex-1 items-center justify-center px-4 text-center text-12-regular text-text-weak">
            {props.loadingLabel}
          </div>
        }
      >
        <Show
          when={props.commits.length > 0 || !!props.workingTree}
          fallback={
            <div class="flex flex-1 items-center justify-center px-4 text-center text-12-regular text-text-weak">
              {props.empty}
            </div>
          }
        >
          <div class="min-h-0 flex-1 overflow-auto" data-scrollable>
            <div style={{ "min-width": contentMinWidth() }}>
              <div
                class="grid border-b border-border-weak-base px-3 py-2 text-[11px] font-medium text-text-weaker"
                style={rowGridStyle()}
              >
                <div>Graph</div>
                <div>Commit</div>
                <div>Author</div>
                <div>Time</div>
              </div>
              <div class="relative">
              <div
                class="pointer-events-none absolute top-0 z-10"
                style={{ left: `${graphOffset}px`, width: `${graphWidth()}px`, height: `${graphHeight()}px` }}
              >
                <svg width={graphWidth()} height={graphHeight()} viewBox={`0 0 ${graphWidth()} ${graphHeight()}`}>
                  <Show when={props.workingTree}>
                    <line
                      x1={laneX(workingTreeLane())}
                      y1={rowCenter(0)}
                      x2={laneX(workingTreeLane())}
                      y2={headIndex() >= 0 ? rowCenter(commitRow(headIndex())) : rowBottom(0)}
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      class="text-border-strong-base"
                    />
                  </Show>
                  <For each={props.commits}>
                    {(item, index) => {
                      const row = () => graph().rows[index()]!
                      const rowIndex = () => commitRow(index())
                      return (
                        <>
                          <For each={row().before}>
                            {(lane) => (
                              <line
                                x1={laneX(lane)}
                                y1={rowTop(rowIndex())}
                                x2={laneX(lane)}
                                y2={rowCenter(rowIndex())}
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"
                                class="text-border-strong-base"
                              />
                            )}
                          </For>
                          <For each={row().after}>
                            {(lane) => (
                              <line
                                x1={laneX(lane)}
                                y1={rowCenter(rowIndex())}
                                x2={laneX(lane)}
                                y2={rowBottom(rowIndex())}
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"
                                class="text-border-strong-base"
                              />
                            )}
                          </For>
                          <For each={row().parents.filter((lane) => lane !== row().lane)}>
                            {(lane) => (
                              <path
                                d={`M ${laneX(row().lane)} ${rowCenter(rowIndex())} C ${laneX(row().lane)} ${rowCenter(rowIndex()) + 8}, ${laneX(lane)} ${rowCenter(rowIndex()) + 8}, ${laneX(lane)} ${rowBottom(rowIndex())}`}
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"
                                fill="none"
                                class="text-border-strong-base"
                              />
                            )}
                          </For>
                          <circle
                            cx={laneX(row().lane)}
                            cy={rowCenter(rowIndex())}
                            r="5"
                            fill="currentColor"
                            class={props.selected === item.oid ? "text-text-primary" : "text-text-weak"}
                          />
                          <Show when={item.refs.some((ref) => ref.kind === "head")}>
                            <circle
                              cx={laneX(row().lane)}
                              cy={rowCenter(rowIndex())}
                              r="8"
                              stroke="currentColor"
                              stroke-width="1.5"
                              fill="none"
                              class="text-text-primary"
                            />
                          </Show>
                        </>
                      )
                    }}
                  </For>
                  <Show when={props.workingTree}>
                    <circle cx={laneX(workingTreeLane())} cy={rowCenter(0)} r="5" fill="currentColor" class="text-text-primary" />
                    <circle
                      cx={laneX(workingTreeLane())}
                      cy={rowCenter(0)}
                      r="8"
                      stroke="currentColor"
                      stroke-width="1.5"
                      fill="none"
                      class="text-text-primary"
                    />
                  </Show>
                </svg>
              </div>

              <Show when={props.workingTree}>
                {(workingTree) => (
                  <button
                    type="button"
                    class={rowClass}
                    style={rowGridStyle()}
                    classList={{
                      "bg-surface-base-active": !!workingTree().selected,
                    }}
                    onClick={() => props.onSelect(workingTree().id)}
                  >
                    <div class="pl-3">
                      <div style={{ width: `${graphWidth()}px`, height: `${rowHeight}px` }} />
                    </div>

                    <div class="min-w-0 border-l border-border-weak-base px-3 py-2.5">
                      <div class="truncate text-12-medium leading-5 text-text-strong">Working tree</div>
                      <div class="mt-1 flex flex-wrap gap-1 pr-2">
                        <span class="inline-flex h-4 max-w-full items-center rounded border border-transparent bg-icon-success-base px-1.5 text-[9px] font-medium text-text-invert-base">
                          {workingTree().label}
                        </span>
                      </div>
                      <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-text-weaker">
                        <span>{workingTree().summary}</span>
                      </div>
                    </div>

                    <div class="truncate px-3 py-2.5 text-[10px] text-text-weaker">{workingTree().files} files</div>
                    <div class="truncate px-3 py-2.5 text-[10px] text-text-weaker">now</div>
                  </button>
                )}
              </Show>

              <For each={props.commits}>
                {(item) => (
                  <button
                    type="button"
                    class={rowClass}
                    style={rowGridStyle()}
                    classList={{
                      "bg-surface-base-active": props.selected === item.oid,
                    }}
                    onClick={() => props.onSelect(item.oid)}
                  >
                    <div class="pl-3">
                      <div style={{ width: `${graphWidth()}px`, height: `${rowHeight}px` }} />
                    </div>

                    <Tooltip
                      placement="bottom-start"
                      contentClass={tooltipClass}
                      value={
                        <div class="flex w-[360px] max-w-[360px] flex-col">
                          <div class="border-b border-border-weak-base px-3 py-2">
                            <div class="break-words text-12-medium text-text-strong">{item.subject || item.short}</div>
                            <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-11-regular text-text-weaker">
                              <span class="font-mono">{item.short}</span>
                              <span>{item.author_name}</span>
                              <span>{historyTime(item.authored_at)}</span>
                            </div>
                          </div>
                          <div class="flex flex-col gap-2 p-3">
                            <Show when={item.refs.length > 0}>
                              <div class="flex flex-wrap gap-1">
                                <For each={item.refs}>
                                  {(ref) => (
                                    <span class={`inline-flex h-5 items-center rounded border px-1.5 text-[10px] font-medium ${refClass(ref.kind)}`}>
                                      {refLabel(ref.kind)}: {ref.name}
                                    </span>
                                  )}
                                </For>
                              </div>
                            </Show>
                          </div>
                        </div>
                      }
                    >
                      <div class="min-w-0 border-l border-border-weak-base px-3 py-2.5">
                        <div
                          class="truncate text-12-medium leading-5 text-text-strong transition-colors group-hover:text-text-primary"
                          classList={{
                            "text-text-primary": props.selected === item.oid,
                          }}
                        >
                          {item.subject || item.short}
                        </div>
                        <Show when={item.refs.length > 0}>
                          <div class="mt-1 flex flex-wrap gap-1 pr-2">
                            <For each={item.refs}>
                              {(ref) => (
                                <span
                                  class={`inline-flex h-4 max-w-full items-center rounded border px-1.5 text-[9px] font-medium ${refClass(ref.kind)}`}
                                  title={ref.name}
                                >
                                  {ref.name}
                                </span>
                              )}
                            </For>
                          </div>
                        </Show>
                        <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-text-weaker">
                          <span class="font-mono">{item.short}</span>
                          <span aria-hidden="true">·</span>
                          <span title={historyTime(item.authored_at)}>{historyTimeAgo(item.authored_at)}</span>
                        </div>
                      </div>
                    </Tooltip>

                    <div class="truncate px-3 py-2.5 text-[10px] text-text-weaker">{item.author_name}</div>
                    <div class="truncate px-3 py-2.5 text-[10px] text-text-weaker" title={historyTime(item.authored_at)}>
                      {historyTimeAgo(item.authored_at)}
                    </div>
                  </button>
                )}
              </For>
              </div>

              <Show when={props.hasMore}>
                <div class="p-3">
                  <Button
                    variant="ghost"
                    class="w-full justify-center"
                    disabled={props.loadingMore}
                    onClick={() => props.onLoadMore?.()}
                  >
                    <Show when={props.loadingMore} fallback={props.loadMoreLabel}>
                      <div class="flex items-center gap-2">
                        <div class="size-3.5 animate-spin rounded-full border-2 border-icon-base border-t-transparent" />
                        <span>{props.loadingLabel}</span>
                      </div>
                    </Show>
                  </Button>
                </div>
              </Show>
            </div>
          </div>
        </Show>
      </Show>
    </div>
  )
}
