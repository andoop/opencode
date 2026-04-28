import {
  For,
  onCleanup,
  onMount,
  Show,
  Match,
  Switch,
  createMemo,
  createEffect,
  createSignal,
  on,
  type JSX,
} from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { Dynamic } from "solid-js/web"
import { useLocal } from "@/context/local"
import { selectionFromLines, useFile, type FileSelection, type SelectedLineRange } from "@/context/file"
import { createStore } from "solid-js/store"
import { PromptInput } from "@/components/prompt-input"
import { SessionContextUsage } from "@/components/session-context-usage"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip, TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { Tabs } from "@opencode-ai/ui/tabs"
import { useCodeComponent } from "@opencode-ai/ui/context/code"
import { LineComment as LineCommentView, LineCommentEditor } from "@opencode-ai/ui/line-comment"
import { SessionTurn } from "@opencode-ai/ui/session-turn"
import { BasicTool } from "@opencode-ai/ui/basic-tool"
import { createAutoScroll } from "@opencode-ai/ui/hooks"
import { SessionReview } from "@opencode-ai/ui/session-review"
import { Mark } from "@opencode-ai/ui/logo"
import { Spinner } from "@opencode-ai/ui/spinner"

import { DragDropProvider, DragDropSensors, DragOverlay, SortableProvider, closestCenter } from "@thisbeyond/solid-dnd"
import type { DragEvent } from "@thisbeyond/solid-dnd"
import { useSync } from "@/context/sync"
import { useTerminal, type LocalPTY } from "@/context/terminal"
import { useLayout, type LocalProject } from "@/context/layout"
import { Terminal } from "@/components/terminal"
import { checksum, base64Encode } from "@opencode-ai/util/encode"
import { findLast } from "@opencode-ai/util/array"
import { Binary } from "@opencode-ai/util/binary"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogSelectBranch, type BranchDialogConfirm } from "@/components/dialog-select-branch"
import { DialogSelectFile } from "@/components/dialog-select-file"
import FileTree from "@/components/file-tree"
import { DialogSelectModel } from "@/components/dialog-select-model"
import { DialogSelectMcp } from "@/components/dialog-select-mcp"
import { DialogFork } from "@/components/dialog-fork"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useNavigate, useParams } from "@solidjs/router"
import { UserMessage, type File as GitStatusFile } from "@opencode-ai/sdk/v2"
import type { FileDiff } from "@opencode-ai/sdk/v2/client"
import type { QuestionAnswer } from "@opencode-ai/sdk/v2"
import { useSDK } from "@/context/sdk"
import { usePlatform } from "@/context/platform"
import { useAuth, addAuthInterceptor } from "@/context/auth"
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import { usePrompt } from "@/context/prompt"
import { useComments, type LineComment } from "@/context/comments"
import { extractPromptFromParts } from "@/utils/prompt"
import { ConstrainDragYAxis, getDraggableId } from "@/utils/solid-dnd"
import { usePermission } from "@/context/permission"
import { decode64 } from "@/utils/base64"
import { showToast } from "@opencode-ai/ui/toast"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { getFilename } from "@opencode-ai/util/path"
import {
  SessionHeader,
  SessionContextTab,
  SortableTab,
  FileVisual,
  SortableTerminalTab,
  NewSessionView,
  SessionGitHistoryTab,
  SessionGitCommitDetail,
} from "@/components/session"
import type { SessionGitHistoryEntry } from "@/components/session/session-git-history-tab"
import type { SessionGitCommitDetailValue } from "@/components/session/session-git-commit-detail"
import { navMark, navParams } from "@/utils/perf"
import { same } from "@/utils/same"
import { DataProvider } from "@opencode-ai/ui/context"
import { iife } from "@opencode-ai/util/iife"
import { workspaceFetch, type WorkspaceInfo } from "@/utils/workspace-api"

type DiffStyle = "unified" | "split"
type SessionCreateStep = "create" | "worktree" | "open"
type GitHistoryPage = {
  items: SessionGitHistoryEntry[]
  next?: string
}
type GitHistoryProject = {
  id: string
  directory: string
  label: string
  prefix: string
  branch?: string
}
type GitHistoryVcs = {
  loading: boolean
  branch?: string
  tracking?: string
  worktree?: string
}
const HISTORY_WORKING_TREE_ID = "__working_tree__"
type BranchDialogOutcome = BranchDialogConfirm | { kind: "cancel" }

const createSessionState = () => ({
  open: false,
  status: "idle" as "idle" | "running" | "error",
  step: "create" as SessionCreateStep,
  projectRoot: "",
  sessionDirectory: "",
  needsWorktree: false,
  error: "",
})

const handoff = {
  prompt: "",
  terminals: [] as string[],
  files: {} as Record<string, SelectedLineRange | null>,
}

interface SessionReviewTabProps {
  diffs: () => FileDiff[]
  view: () => ReturnType<ReturnType<typeof useLayout>["view"]>
  diffStyle: DiffStyle
  onDiffStyleChange?: (style: DiffStyle) => void
  onViewFile?: (file: string) => void
  onLineComment?: (comment: { file: string; selection: SelectedLineRange; comment: string; preview?: string }) => void
  comments?: LineComment[]
  focusedComment?: { file: string; id: string } | null
  onFocusedCommentChange?: (focus: { file: string; id: string } | null) => void
  focusedFile?: string
  onScrollRef?: (el: HTMLDivElement) => void
  readFile?: (path: string) => Promise<import("@opencode-ai/sdk/v2").FileContent | undefined>
  classes?: {
    root?: string
    header?: string
    container?: string
  }
}

function StickyAddButton(props: { children: JSX.Element }) {
  const [stuck, setStuck] = createSignal(false)
  let button: HTMLDivElement | undefined

  createEffect(() => {
    const node = button
    if (!node) return

    const scroll = node.parentElement
    if (!scroll) return

    const handler = () => {
      const rect = node.getBoundingClientRect()
      const scrollRect = scroll.getBoundingClientRect()
      setStuck(rect.right >= scrollRect.right && scroll.scrollWidth > scroll.clientWidth)
    }

    scroll.addEventListener("scroll", handler, { passive: true })
    const observer = new ResizeObserver(handler)
    observer.observe(scroll)
    handler()
    onCleanup(() => {
      scroll.removeEventListener("scroll", handler)
      observer.disconnect()
    })
  })

  return (
    <div
      ref={button}
      class="bg-background-base h-full shrink-0 sticky right-0 z-10 flex items-center justify-center border-b border-border-weak-base px-3"
      classList={{ "border-l": stuck() }}
    >
      {props.children}
    </div>
  )
}

function SessionReviewTab(props: SessionReviewTabProps) {
  let scroll: HTMLDivElement | undefined
  let frame: number | undefined
  let pending: { x: number; y: number } | undefined

  const sdk = useSDK()

  const readFile =
    props.readFile ??
    (async (path: string) => {
      return sdk.client.file
        .read({ path })
        .then((x) => x.data)
        .catch(() => undefined)
    })

  const restoreScroll = () => {
    const el = scroll
    if (!el) return

    const s = props.view().scroll("review")
    if (!s) return

    if (el.scrollTop !== s.y) el.scrollTop = s.y
    if (el.scrollLeft !== s.x) el.scrollLeft = s.x
  }

  const handleScroll = (event: Event & { currentTarget: HTMLDivElement }) => {
    pending = {
      x: event.currentTarget.scrollLeft,
      y: event.currentTarget.scrollTop,
    }
    if (frame !== undefined) return

    frame = requestAnimationFrame(() => {
      frame = undefined

      const next = pending
      pending = undefined
      if (!next) return

      props.view().setScroll("review", next)
    })
  }

  createEffect(
    on(
      () => props.diffs().length,
      () => {
        requestAnimationFrame(restoreScroll)
      },
      { defer: true },
    ),
  )

  onCleanup(() => {
    if (frame === undefined) return
    cancelAnimationFrame(frame)
  })

  return (
    <SessionReview
      scrollRef={(el) => {
        scroll = el
        props.onScrollRef?.(el)
        restoreScroll()
      }}
      onScroll={handleScroll}
      onDiffRendered={() => requestAnimationFrame(restoreScroll)}
      open={props.view().review.open()}
      onOpenChange={props.view().review.setOpen}
      classes={{
        root: props.classes?.root ?? "pb-40",
        header: props.classes?.header ?? "px-6",
        container: props.classes?.container ?? "px-6",
      }}
      diffs={props.diffs()}
      diffStyle={props.diffStyle}
      onDiffStyleChange={props.onDiffStyleChange}
      onViewFile={props.onViewFile}
      focusedFile={props.focusedFile}
      readFile={readFile}
      onLineComment={props.onLineComment}
      comments={props.comments}
      focusedComment={props.focusedComment}
      onFocusedCommentChange={props.onFocusedCommentChange}
    />
  )
}

export default function Page() {
  const layout = useLayout()
  const local = useLocal()
  const file = useFile()
  const sync = useSync()
  const terminalContext = useTerminal()
  const dialog = useDialog()
  const codeComponent = useCodeComponent()
  const command = useCommand()
  const language = useLanguage()
  const params = useParams()
  const navigate = useNavigate()
  const sdk = useSDK()
  const platform = usePlatform()
  const auth = useAuth()
  const prompt = usePrompt()
  const comments = useComments()
  const permission = usePermission()
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()

  // Get session directory (may be worktree) to read data from correct store
  // First try to get from sync.session.get (project root), but if not found,
  // we'll find it in sessionSyncData after checking worktree stores
  //
  // Cache the last resolved directory per session to prevent flip-flop when the
  // session is temporarily removed from the project root store (e.g. by trimSessions).
  // Without this, sending a message from a history session can cause the page to switch
  // from watching the worktree store back to the project root store, losing events.
  let cachedDirForSession: string | undefined
  let cachedDirSessionId: string | undefined

  const sessionDirectory = createMemo(() => {
    const sessionID = params.id
    if (!sessionID) {
      cachedDirForSession = undefined
      cachedDirSessionId = undefined
      return sdk.directory
    }
    if (sessionID !== cachedDirSessionId) {
      cachedDirForSession = undefined
      cachedDirSessionId = sessionID
    }
    // Try project root first
    const rootSession = sync.session.get(sessionID)
    if (rootSession?.directory) {
      cachedDirForSession = rootSession.directory
      return rootSession.directory
    }
    // If the session was previously resolved to a specific directory, keep using it
    // instead of falling back to sdk.directory (prevents store flip-flop)
    if (cachedDirForSession) return cachedDirForSession
    // Fall back to project directory - sessionSyncData will find the correct store
    return sdk.directory
  })
  // Get sync data from session directory, not project directory
  // If session is found in this store and has a different directory, use that
  // Also check if messages exist in this store to determine if it's the correct store
  //
  // Similarly cache the resolved actual directory to prevent flip-flop.
  let resolvedDir: string | undefined
  let resolvedDirSessionId: string | undefined

  const sessionSyncResult = createMemo(() => {
    const dir = sessionDirectory()
    const sessionID = params.id

    if (sessionID !== resolvedDirSessionId) {
      resolvedDir = undefined
      resolvedDirSessionId = sessionID
    }

    let data = globalSync.child(dir)[0]
    let actualDir = dir

    // Try to find session in this store
    if (sessionID) {
      const match = Binary.search(data.session, sessionID, (s) => s.id)
      if (match.found) {
        const foundSession = data.session[match.index]
        // If session has a directory and it's different from current dir, use that
        if (foundSession?.directory && foundSession.directory !== dir) {
          actualDir = foundSession.directory
          data = globalSync.child(actualDir)[0]
        }
      } else {
        // Session not found in session list - prefer the previously resolved directory
        // to avoid switching stores when the session is temporarily trimmed
        if (resolvedDir && resolvedDir !== dir) {
          actualDir = resolvedDir
          data = globalSync.child(actualDir)[0]
        } else {
          // First-time resolution: check if messages exist or search sandboxes
          const hasMessages = data.message[sessionID] !== undefined
          if (!hasMessages && dir === sdk.directory) {
            // No messages in project root, try to find session in worktree stores
            const project = layout.projects.list().find((p) => p.worktree === sdk.directory)
            if (project) {
              const sandboxes = [project.worktree, ...(project.sandboxes ?? [])]
              for (const sandboxDir of sandboxes) {
                const sandboxData = globalSync.child(sandboxDir)[0]
                if (sandboxData.message[sessionID] !== undefined && sandboxData.message[sessionID].length > 0) {
                  actualDir = sandboxDir
                  data = sandboxData
                  break
                }
                const sandboxMatch = Binary.search(sandboxData.session, sessionID, (s) => s.id)
                if (sandboxMatch.found) {
                  const foundSandboxSession = sandboxData.session[sandboxMatch.index]
                  if (foundSandboxSession?.directory) {
                    actualDir = foundSandboxSession.directory
                    data = globalSync.child(actualDir)[0]
                    break
                  }
                }
              }
            }
          }
        }
      }
    }

    // Cache the resolved directory so we don't lose it if the session is trimmed
    if (actualDir !== sdk.directory) {
      resolvedDir = actualDir
    }

    return { data, directory: actualDir }
  })
  const sessionSyncData = createMemo(() => sessionSyncResult().data)
  const actualSessionDir = createMemo(() => sessionSyncResult().directory)
  const permissionClient = createMemo(() =>
    actualSessionDir() === sdk.directory
      ? sdk.client
      : createOpencodeClient({
          baseUrl: sdk.url,
          fetch: platform.fetch,
          directory: actualSessionDir(),
          throwOnError: true,
          onClient: (c) => addAuthInterceptor(c, () => auth.token),
        }),
  )
  const terminalDir = createMemo(() => actualSessionDir() || sdk.directory)
  const terminal = {
    ready: () => terminalContext.directory(terminalDir(), params.id).ready(),
    all: () => terminalContext.directory(terminalDir(), params.id).all(),
    active: () => terminalContext.directory(terminalDir(), params.id).active(),
    new: () => terminalContext.directory(terminalDir(), params.id).new(),
    update: (pty: Partial<LocalPTY> & { id: string }) =>
      terminalContext.directory(terminalDir(), params.id).update(pty),
    clone: (id: string) => terminalContext.directory(terminalDir(), params.id).clone(id),
    open: (id: string) => terminalContext.directory(terminalDir(), params.id).open(id),
    close: (id: string) => terminalContext.directory(terminalDir(), params.id).close(id),
    move: (id: string, to: number) => terminalContext.directory(terminalDir(), params.id).move(id, to),
    next: () => terminalContext.directory(terminalDir(), params.id).next(),
    previous: () => terminalContext.directory(terminalDir(), params.id).previous(),
  }
  // Get session info from sessionSyncData (which may be from worktree store)
  // Cache the result to prevent losing session info when the session is temporarily
  // removed from the store by trimSessions.
  let cachedInfo: ReturnType<typeof sync.session.get>
  let cachedInfoSessionId: string | undefined
  const info = createMemo(() => {
    if (!params.id) {
      cachedInfo = undefined
      cachedInfoSessionId = undefined
      return undefined
    }
    if (params.id !== cachedInfoSessionId) {
      cachedInfo = undefined
      cachedInfoSessionId = params.id
    }
    const data = sessionSyncData()
    const match = Binary.search(data.session, params.id, (s) => s.id)
    if (match.found) {
      cachedInfo = data.session[match.index]
      return data.session[match.index]
    }
    // Fallback to project root store
    const root = sync.session.get(params.id)
    if (root) {
      cachedInfo = root
      return root
    }
    // Use cached info to prevent transient undefined
    if (cachedInfo) return cachedInfo
    return undefined
  })

  const request = createMemo(() => {
    const sessionID = params.id
    if (!sessionID) return
    const next = sessionSyncData().permission[sessionID]?.[0]
    if (!next) return
    if (next.tool) return
    return next
  })

  const [ui, setUi] = createStore({
    responding: false,
    pendingMessage: undefined as string | undefined,
    scrollGesture: 0,
    autoCreated: false,
    creating: createSessionState(),
  })

  createEffect(() => {
    document.body.style.overflow = ui.creating.open ? "hidden" : ""
  })

  onCleanup(() => {
    document.body.style.overflow = ""
  })

  createEffect(
    on(
      () => request()?.id,
      () => setUi("responding", false),
      { defer: true },
    ),
  )

  const decide = (response: "once" | "always" | "reject") => {
    const perm = request()
    if (!perm) return
    if (ui.responding) return

    setUi("responding", true)
    permissionClient()
      .permission.respond({ sessionID: perm.sessionID, permissionID: perm.id, response })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        showToast({ title: language.t("common.requestFailed"), description: message })
      })
      .finally(() => setUi("responding", false))
  }
  const sessionKey = createMemo(() => `${params.dir}${params.id ? "/" + params.id : ""}`)
  const tabs = createMemo(() => layout.tabs(sessionKey))
  const view = createMemo(() => layout.view(sessionKey))
  const creatingCopy = createMemo(() =>
    language.locale().startsWith("zh")
      ? {
          title: "正在创建新会话",
          description: "正在准备独立工作区，请稍候。在创建完成前，当前页面操作会被暂时阻塞。",
          project: "项目",
          session: "会话目录",
          loading: "处理中",
          failed: "创建失败",
          createTitle: "创建会话",
          createDescription: "正在初始化新会话记录",
          worktreeTitle: "准备工作区",
          worktreeDescription: "正在创建并等待 Git worktree 就绪",
          worktreeSkipped: "当前项目无需额外创建工作区",
          openTitle: "进入会话",
          openDescription: "正在同步数据并打开新会话",
          pending: "等待中",
          active: "进行中",
          completed: "已完成",
          skipped: "已跳过",
          error: "失败",
          retry: "重试",
          close: "返回当前页面",
        }
      : {
          title: "Creating new session",
          description:
            "Preparing an isolated workspace. Interaction is temporarily blocked until the session is ready.",
          project: "Project",
          session: "Session directory",
          loading: "Working",
          failed: "Creation failed",
          createTitle: "Create session",
          createDescription: "Initializing the session record",
          worktreeTitle: "Prepare workspace",
          worktreeDescription: "Creating and waiting for the Git worktree",
          worktreeSkipped: "No extra workspace is needed for this project",
          openTitle: "Open session",
          openDescription: "Syncing data and opening the new session",
          pending: "Pending",
          active: "In progress",
          completed: "Completed",
          skipped: "Skipped",
          error: "Failed",
          retry: "Retry",
          close: "Back to current page",
        },
  )
  const workspaceCopy = createMemo(() =>
    language.locale().startsWith("zh")
      ? {
          title: "正在准备工作区",
          description: "首次进入需要工作区能力的页面时，正在初始化项目实例并等待相关数据就绪。",
          project: "项目",
          workspace: "工作区",
        }
      : {
          title: "Preparing workspace",
          description: "Initializing the project instance and loading workspace data for this view.",
          project: "Project",
          workspace: "Workspace",
        },
  )

  const resetSessionCreation = () => {
    setUi("creating", createSessionState())
  }

  const sessionCreateStepState = (step: SessionCreateStep) => {
    if (!ui.creating.open) return "pending" as const
    if (step === "create") {
      if (ui.creating.step === "create") return ui.creating.status === "error" ? "error" : "active"
      return "completed"
    }
    if (step === "worktree") {
      if (!ui.creating.needsWorktree && ui.creating.step === "open") return "skipped"
      if (ui.creating.step === "worktree") return ui.creating.status === "error" ? "error" : "active"
      if (ui.creating.step === "open") return "completed"
      return "pending"
    }
    if (ui.creating.step === "open") return ui.creating.status === "error" ? "error" : "active"
    return "pending"
  }

  const selectBranch = (directory: string, projectName: string, titleSuffix?: string) =>
    new Promise<BranchDialogOutcome>((resolve) => {
      let resolved = false
      const finish = (value: BranchDialogOutcome) => {
        if (resolved) return
        resolved = true
        resolve(value)
      }
      dialog.show(
        () => (
          <DialogSelectBranch
            directory={directory}
            projectName={projectName}
            titleSuffix={titleSuffix}
            onConfirm={(value) => finish(value)}
          />
        ),
        () => finish({ kind: "cancel" }),
      )
    })

  const collectSessionBranches = async (project: LocalProject) => {
    const workspace = project.id
      ? await workspaceFetch<WorkspaceInfo>(
          globalSDK.url,
          `/workspace/${encodeURIComponent(project.id)}`,
          { token: auth.token ?? undefined, fetchFn: platform.fetch ?? fetch },
        ).catch(() => undefined)
      : undefined

    const gitProjects: { projectID: string; directory: string; label: string }[] = []

    if (workspace?.projects?.length) {
      for (const item of workspace.projects) {
        if (item.vcs !== "git") continue
        gitProjects.push({
          projectID: item.projectID,
          directory: item.sourceDirectory,
          label: item.name?.trim() || item.slug || getFilename(item.sourceDirectory),
        })
      }
    } else if (project.vcs === "git" && project.id) {
      gitProjects.push({
        projectID: project.id,
        directory: project.worktree,
        label: project.name || getFilename(project.worktree),
      })
    }

    if (gitProjects.length === 0) {
      return { cancelled: false, branches: undefined, workspaceID: workspace?.id }
    }

    const branches: Record<string, Extract<BranchDialogConfirm, { kind: "pick" }>["branch"]> = {}
    const total = gitProjects.length
    let i = 0
    for (const item of gitProjects) {
      i += 1
      const suffix = total > 1 ? ` (${i}/${total})` : ""
      const outcome = await selectBranch(item.directory, item.label, suffix)
      if (outcome.kind === "cancel") return { cancelled: true }
      if (outcome.kind === "pick") branches[item.projectID] = outcome.branch
    }

    return {
      cancelled: false,
      branches: Object.keys(branches).length ? branches : undefined,
      workspaceID: workspace?.id,
    }
  }

  const startSessionCreation = async (project: LocalProject) => {
    if (ui.creating.open && ui.creating.status === "running") return

    const branchPick = await collectSessionBranches(project)
    if (branchPick.cancelled) return

    const { branches, workspaceID } = branchPick

    setUi("creating", {
      ...createSessionState(),
      open: true,
      status: "running",
      projectRoot: project.worktree,
    })

    const fail = (message: string, step: SessionCreateStep) => {
      setUi("creating", "status", "error")
      setUi("creating", "step", step)
      setUi("creating", "error", message)
    }

    const created = await sdk.client.session
      .create({ branches, workspaceID })
      .then((x) => x.data)
      .catch((err) => {
        fail(err instanceof Error ? err.message : String(err), "create")
        return undefined
      })

    if (!created) return

    const sessionDirectory = created.directory
    const needsWorktree = sessionDirectory !== project.worktree
    setUi("creating", "sessionDirectory", sessionDirectory)
    setUi("creating", "needsWorktree", needsWorktree)

    if (needsWorktree) {
      setUi("creating", "step", "worktree")
      const { Worktree: WorktreeState } = await import("@/utils/worktree")
      WorktreeState.pending(sessionDirectory)

      const timeoutMs = 5 * 60 * 1000
      const timeout = new Promise<{ status: "failed"; message: string }>((resolve) => {
        setTimeout(() => {
          resolve({ status: "failed", message: language.t("workspace.error.stillPreparing") })
        }, timeoutMs)
      })

      const result = await Promise.race([WorktreeState.wait(sessionDirectory), timeout])
      if (result.status === "failed") {
        fail(result.message, "worktree")
        return
      }
    }

    setUi("creating", "step", "open")
    globalSync.child(sessionDirectory)
    resetSessionCreation()
    navigate(`/${base64Encode(sessionDirectory)}/session/${created.id}`)
  }

  const currentProject = () => {
    const directory = decode64(params.dir)
    const fallbackProjectRoot = sync.project?.worktree
    const project =
      layout.projects.list().find((p) => p.worktree === directory || p.sandboxes?.includes(directory ?? "")) ??
      layout.projects.list().find((p) => p.worktree === fallbackProjectRoot)
    return project
  }

  const createSessionFromCurrentProject = async () => {
    const project = currentProject()
    if (!project) return
    await startSessionCreation(project)
  }

  if (import.meta.env.DEV) {
    createEffect(
      on(
        () => [params.dir, params.id] as const,
        ([dir, id], prev) => {
          if (!id) return
          navParams({ dir, from: prev?.[1], to: id })
        },
      ),
    )

    createEffect(() => {
      const id = params.id
      if (!id) return
      if (!prompt.ready()) return
      navMark({ dir: params.dir, to: id, name: "storage:prompt-ready" })
    })

    createEffect(() => {
      const id = params.id
      if (!id) return
      if (!terminal.ready()) return
      navMark({ dir: params.dir, to: id, name: "storage:terminal-ready" })
    })

    createEffect(() => {
      const id = params.id
      if (!id) return
      if (!file.ready()) return
      navMark({ dir: params.dir, to: id, name: "storage:file-view-ready" })
    })

    createEffect(() => {
      const id = params.id
      if (!id) return
      if (sessionSyncData().message[id] === undefined) return
      navMark({ dir: params.dir, to: id, name: "session:data-ready" })
    })
  }

  const isDesktop = createMediaQuery("(min-width: 768px)")
  const centered = createMemo(() => isDesktop() && !layout.fileTree.opened())

  function normalizeTab(tab: string) {
    if (!tab.startsWith("file://")) return tab
    return file.tab(tab)
  }

  function normalizeTabs(list: string[]) {
    const seen = new Set<string>()
    const next: string[] = []
    for (const item of list) {
      const value = normalizeTab(item)
      if (seen.has(value)) continue
      seen.add(value)
      next.push(value)
    }
    return next
  }

  const openTab = (value: string) => {
    const next = normalizeTab(value)
    tabs().open(next)

    const path = file.pathFromTab(next)
    if (path) file.load(path)
  }

  createEffect(() => {
    const active = tabs().active()
    if (!active) return

    const path = file.pathFromTab(active)
    if (path) file.load(path)
  })

  createEffect(() => {
    const current = tabs().all()
    if (current.length === 0) return

    const next = normalizeTabs(current)
    if (same(current, next)) return

    tabs().setAll(next)

    const active = tabs().active()
    if (!active) return
    if (!active.startsWith("file://")) return

    const normalized = normalizeTab(active)
    if (active === normalized) return
    tabs().setActive(normalized)
  })

  const [gitStatus, setGitStatus] = createSignal<
    Array<{ path: string; added: number; removed: number; status: string }>
  >([])
  const [gitDiffs, setGitDiffs] = createSignal<FileDiff[]>([])
  const [gitDiffsReady, setGitDiffsReady] = createSignal(false)
  const [gitRefresh, setGitRefresh] = createSignal(0)
  const [gitHistory, setGitHistory] = createSignal<GitHistoryPage>({ items: [] })
  const [gitHistoryLoading, setGitHistoryLoading] = createSignal(false)
  const [gitHistoryLoadingMore, setGitHistoryLoadingMore] = createSignal(false)
  const [gitHistoryCommit, setGitHistoryCommit] = createSignal<SessionGitCommitDetailValue>()
  const [gitHistoryCommitLoading, setGitHistoryCommitLoading] = createSignal(false)
  const [gitHistoryProjects, setGitHistoryProjects] = createSignal<GitHistoryProject[]>([])
  const [gitHistoryVcs, setGitHistoryVcs] = createSignal<GitHistoryVcs>({ loading: false })
  const [gitHistoryStatus, setGitHistoryStatus] = createSignal<GitStatusFile[]>([])
  const [gitHistoryDiffs, setGitHistoryDiffs] = createSignal<FileDiff[]>([])
  const [gitHistoryDiffsReady, setGitHistoryDiffsReady] = createSignal(false)
  const [selectedHistoryProject, setSelectedHistoryProject] = createSignal<string>()
  const [selectedHistoryCommit, setSelectedHistoryCommit] = createSignal<string>()
  const [fileTreeRefreshing, setFileTreeRefreshing] = createSignal(false)
  let gitStatusRequest = 0
  let gitHistoryRequest = 0
  let gitCommitRequest = 0
  let gitHistoryStatusRequest = 0
  let gitHistoryProjectsRequest = 0
  const reviewCount = createMemo(() => gitDiffs().length)
  const hasReview = createMemo(() => reviewCount() > 0)
  const revertMessageID = createMemo(() => info()?.revert?.messageID)
  const messages = createMemo(() => {
    const id = params.id
    if (!id) return []
    // Use sessionSyncData which already handles finding the correct store (worktree or project root)
    const data = sessionSyncData()
    // Access message property to create reactive dependency
    const msgs = data.message[id] ?? []
    return msgs
  })
  const parts = (messageID: string) => sessionSyncData().part[messageID] ?? []
  const messagesReady = createMemo(() => {
    const id = params.id
    if (!id) return true
    return sessionSyncData().message[id] !== undefined
  })
  const historyMore = createMemo(() => {
    const id = params.id
    if (!id) return false
    return sync.session.history.more(id)
  })
  const historyLoading = createMemo(() => {
    const id = params.id
    if (!id) return false
    return sync.session.history.loading(id)
  })
  // Track messages changes for debugging
  createEffect(() => {
    messages()
  })

  const emptyUserMessages: UserMessage[] = []
  const userMessages = createMemo(
    () => {
      const msgs = messages().filter((m) => m.role === "user") as UserMessage[]
      return msgs
    },
    emptyUserMessages,
    { equals: same },
  )
  const visibleUserMessages = createMemo(
    () => {
      const revert = revertMessageID()
      const msgs = !revert ? userMessages() : userMessages().filter((m) => m.id < revert)
      return msgs
    },
    emptyUserMessages,
    {
      equals: same,
    },
  )
  const lastUserMessage = createMemo(() => visibleUserMessages().at(-1))

  createEffect(
    on(
      () => lastUserMessage()?.id,
      () => {
        const msg = lastUserMessage()
        if (!msg) return
        if (msg.agent) local.agent.set(msg.agent)
        if (msg.model) local.model.set(msg.model)
      },
    ),
  )

  const [store, setStore] = createStore({
    activeDraggable: undefined as string | undefined,
    activeTerminalDraggable: undefined as string | undefined,
    expanded: {} as Record<string, boolean>,
    messageId: undefined as string | undefined,
    turnStart: 0,
    mobileTab: "session" as "session" | "git",
    promptHeight: 0,
  })

  const renderedUserMessages = createMemo(
    () => {
      const msgs = visibleUserMessages()
      const start = store.turnStart
      const result = start <= 0 ? msgs : start >= msgs.length ? emptyUserMessages : msgs.slice(start)
      return result
    },
    emptyUserMessages,
    {
      equals: same,
    },
  )

  const activeMessage = createMemo(() => {
    if (!store.messageId) return lastUserMessage()
    const found = visibleUserMessages()?.find((m) => m.id === store.messageId)
    return found ?? lastUserMessage()
  })
  const setActiveMessage = (message: UserMessage | undefined) => {
    setStore("messageId", message?.id)
  }

  function navigateMessageByOffset(offset: number) {
    const msgs = visibleUserMessages()
    if (msgs.length === 0) return

    const current = activeMessage()
    const currentIndex = current ? msgs.findIndex((m) => m.id === current.id) : -1
    const targetIndex = currentIndex === -1 ? (offset > 0 ? 0 : msgs.length - 1) : currentIndex + offset
    if (targetIndex < 0 || targetIndex >= msgs.length) return

    if (targetIndex === msgs.length - 1) {
      resumeScroll()
      return
    }

    autoScroll.pause()
    scrollToMessage(msgs[targetIndex], "auto")
  }

  const kinds = createMemo(() => {
    const merge = (a: "add" | "del" | "mix" | undefined, b: "add" | "del" | "mix") => {
      if (!a) return b
      if (a === b) return a
      return "mix" as const
    }

    const normalize = (p: string) => p.replaceAll("\\\\", "/").replace(/\/+$/, "")

    const out = new Map<string, "add" | "del" | "mix">()
    for (const diff of gitDiffs()) {
      const file = normalize(diff.file)
      const kind = diff.status === "added" ? "add" : diff.status === "deleted" ? "del" : "mix"

      out.set(file, kind)

      const parts = file.split("/")
      for (const [idx] of parts.slice(0, -1).entries()) {
        const dir = parts.slice(0, idx + 1).join("/")
        if (!dir) continue
        out.set(dir, merge(out.get(dir), kind))
      }
    }
    return out
  })
  const emptyDiffFiles: string[] = []
  const diffFiles = createMemo(() => gitDiffs().map((d) => d.file), emptyDiffFiles, { equals: same })
  const diffsReady = createMemo(() => gitDiffsReady())

  const idle = { type: "idle" as const }
  let inputRef!: HTMLDivElement
  let promptDock: HTMLDivElement | undefined
  let scroller: HTMLDivElement | undefined

  const scrollGestureWindowMs = 250

  let touchGesture: number | undefined

  const markScrollGesture = (target?: EventTarget | null) => {
    const root = scroller
    if (!root) return

    const el = target instanceof Element ? target : undefined
    const nested = el?.closest("[data-scrollable]")
    if (nested && nested !== root) return

    setUi("scrollGesture", Date.now())
  }

  const hasScrollGesture = () => Date.now() - ui.scrollGesture < scrollGestureWindowMs

  createEffect(() => {
    if (!params.id) return
    // Use actualSessionDir which resolves the correct worktree directory
    const dir = actualSessionDir()
    // Ensure the session directory is initialized (but don't bootstrap if already done)
    if (dir) globalSync.child(dir, { bootstrap: false })
    // Sync using the session directory (handles both worktree and project root)
    sync.session.sync(params.id, dir !== sdk.directory ? dir : undefined).catch(() => {})
  })

  createEffect(() => {
    if (!view().terminal.opened()) {
      setUi("autoCreated", false)
      return
    }
    if (!terminal.ready() || terminal.all().length !== 0 || ui.autoCreated) return
    terminal.new()
    setUi("autoCreated", true)
  })

  createEffect(
    on(
      () => terminal.all().length,
      (count, prevCount) => {
        if (prevCount !== undefined && prevCount > 0 && count === 0) {
          if (view().terminal.opened()) {
            view().terminal.toggle()
          }
        }
      },
    ),
  )

  createEffect(
    on(
      () => terminal.active(),
      (activeId) => {
        if (!activeId || !view().terminal.opened()) return
        // Immediately remove focus
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
        const wrapper = document.getElementById(`terminal-wrapper-${activeId}`)
        const element = wrapper?.querySelector('[data-component="terminal"]') as HTMLElement
        if (!element) return

        // Find and focus the ghostty textarea (the actual input element)
        const textarea = element.querySelector("textarea") as HTMLTextAreaElement
        if (textarea) {
          textarea.focus()
          return
        }
        // Fallback: focus container and dispatch pointer event
        element.focus()
        element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }))
      },
    ),
  )

  createEffect(
    on(
      () => visibleUserMessages().at(-1)?.id,
      (lastId, prevLastId) => {
        if (lastId && prevLastId && lastId > prevLastId) {
          setStore("messageId", undefined)
        }
      },
      { defer: true },
    ),
  )

  const status = createMemo(() => sessionSyncData().session_status[params.id ?? ""] ?? idle)

  createEffect(
    on(
      () => params.id,
      () => {
        setStore("messageId", undefined)
        setStore("expanded", {})
      },
      { defer: true },
    ),
  )

  createEffect(() => {
    const id = lastUserMessage()?.id
    if (!id) return
    setStore("expanded", id, status().type !== "idle")
  })

  const selectionPreview = (path: string, selection: FileSelection) => {
    const content = file.get(path)?.content?.content
    if (!content) return undefined
    const start = Math.max(1, Math.min(selection.startLine, selection.endLine))
    const end = Math.max(selection.startLine, selection.endLine)
    const lines = content.split("\n").slice(start - 1, end)
    if (lines.length === 0) return undefined
    return lines.slice(0, 2).join("\n")
  }

  const addSelectionToContext = (path: string, selection: FileSelection) => {
    if (!auth.canFeature("files")) return
    const preview = selectionPreview(path, selection)
    prompt.context.add({ type: "file", path, selection, preview })
  }

  const addCommentToContext = (input: {
    file: string
    selection: SelectedLineRange
    comment: string
    preview?: string
    origin?: "review" | "file"
  }) => {
    if (!auth.canFeature("files")) return
    const selection = selectionFromLines(input.selection)
    const preview = input.preview ?? selectionPreview(input.file, selection)
    const saved = comments.add({
      file: input.file,
      selection: input.selection,
      comment: input.comment,
    })
    prompt.context.add({
      type: "file",
      path: input.file,
      selection,
      comment: input.comment,
      commentID: saved.id,
      commentOrigin: input.origin,
      preview,
    })
  }

  command.register(() => [
    {
      id: "session.new",
      title: language.t("command.session.new"),
      category: language.t("command.category.session"),
      keybind: "mod+shift+s",
      slash: "new",
      disabled: ui.creating.open,
      onSelect: async () => {
        const project = currentProject()
        if (project) {
          await startSessionCreation(project)
        } else {
          navigate(`/${params.dir}/session`)
        }
      },
    },
    {
      id: "file.open",
      title: language.t("command.file.open"),
      description: language.t("palette.search.placeholder"),
      category: language.t("command.category.file"),
      keybind: "mod+p",
      slash: "open",
      disabled: !auth.canFeature("files"),
      onSelect: () => dialog.show(() => <DialogSelectFile onOpenFile={() => showAllFiles()} />),
    },
    {
      id: "tab.close",
      title: language.t("command.tab.close"),
      category: language.t("command.category.file"),
      keybind: "mod+w",
      disabled: !tabs().active(),
      onSelect: () => {
        const active = tabs().active()
        if (!active) return
        tabs().close(active)
      },
    },
    {
      id: "context.addSelection",
      title: language.t("command.context.addSelection"),
      description: language.t("command.context.addSelection.description"),
      category: language.t("command.category.context"),
      keybind: "mod+shift+l",
      disabled:
        !auth.canFeature("files") ||
        (() => {
          const active = tabs().active()
          if (!active) return true
          const path = file.pathFromTab(active)
          if (!path) return true
          return file.selectedLines(path) == null
        })(),
      onSelect: () => {
        const active = tabs().active()
        if (!active) return
        const path = file.pathFromTab(active)
        if (!path) return

        const range = file.selectedLines(path)
        if (!range) {
          showToast({
            title: language.t("toast.context.noLineSelection.title"),
            description: language.t("toast.context.noLineSelection.description"),
          })
          return
        }

        addSelectionToContext(path, selectionFromLines(range))
      },
    },
    {
      id: "terminal.toggle",
      title: language.t("command.terminal.toggle"),
      description: "",
      category: language.t("command.category.view"),
      keybind: "ctrl+`",
      slash: "terminal",
      onSelect: () => view().terminal.toggle(),
    },
    {
      id: "review.toggle",
      title: language.t("command.review.toggle"),
      description: "",
      category: language.t("command.category.view"),
      keybind: "mod+shift+r",
      disabled: !auth.canFeature("files"),
      onSelect: () => layout.fileTree.toggle(),
    },
    {
      id: "terminal.new",
      title: language.t("command.terminal.new"),
      description: language.t("command.terminal.new.description"),
      category: language.t("command.category.terminal"),
      keybind: "ctrl+alt+t",
      onSelect: () => {
        if (terminal.all().length > 0) terminal.new()
        view().terminal.open()
      },
    },
    {
      id: "steps.toggle",
      title: language.t("command.steps.toggle"),
      description: language.t("command.steps.toggle.description"),
      category: language.t("command.category.view"),
      keybind: "mod+e",
      slash: "steps",
      disabled: !params.id,
      onSelect: () => {
        const msg = activeMessage()
        if (!msg) return
        setStore("expanded", msg.id, (open: boolean | undefined) => !open)
      },
    },
    {
      id: "message.previous",
      title: language.t("command.message.previous"),
      description: language.t("command.message.previous.description"),
      category: language.t("command.category.session"),
      keybind: "mod+arrowup",
      disabled: !params.id,
      onSelect: () => navigateMessageByOffset(-1),
    },
    {
      id: "message.next",
      title: language.t("command.message.next"),
      description: language.t("command.message.next.description"),
      category: language.t("command.category.session"),
      keybind: "mod+arrowdown",
      disabled: !params.id,
      onSelect: () => navigateMessageByOffset(1),
    },
    {
      id: "model.choose",
      title: language.t("command.model.choose"),
      description: language.t("command.model.choose.description"),
      category: language.t("command.category.model"),
      keybind: "mod+'",
      slash: "model",
      disabled: !local.model.current() && local.model.list().length === 0,
      onSelect: () => dialog.show(() => <DialogSelectModel />),
    },
    {
      id: "mcp.toggle",
      title: language.t("command.mcp.toggle"),
      description: language.t("command.mcp.toggle.description"),
      category: language.t("command.category.mcp"),
      keybind: "mod+;",
      slash: "mcp",
      disabled: !auth.canFeature("mcp"),
      onSelect: () => dialog.show(() => <DialogSelectMcp />),
    },
    {
      id: "agent.cycle",
      title: language.t("command.agent.cycle"),
      description: language.t("command.agent.cycle.description"),
      category: language.t("command.category.agent"),
      keybind: "mod+.",
      slash: "agent",
      onSelect: () => local.agent.move(1),
    },
    {
      id: "agent.cycle.reverse",
      title: language.t("command.agent.cycle.reverse"),
      description: language.t("command.agent.cycle.reverse.description"),
      category: language.t("command.category.agent"),
      keybind: "shift+mod+.",
      onSelect: () => local.agent.move(-1),
    },
    {
      id: "model.variant.cycle",
      title: language.t("command.model.variant.cycle"),
      description: language.t("command.model.variant.cycle.description"),
      category: language.t("command.category.model"),
      keybind: "shift+mod+d",
      onSelect: () => {
        local.model.variant.cycle()
      },
    },
    {
      id: "permissions.autoaccept",
      title:
        params.id && permission.isAutoAccepting(params.id, sdk.directory)
          ? language.t("command.permissions.autoaccept.disable")
          : language.t("command.permissions.autoaccept.enable"),
      category: language.t("command.category.permissions"),
      keybind: "mod+shift+a",
      disabled: !params.id || !permission.permissionsEnabled(),
      onSelect: () => {
        const sessionID = params.id
        if (!sessionID) return
        permission.toggleAutoAccept(sessionID, sdk.directory)
        showToast({
          title: permission.isAutoAccepting(sessionID, sdk.directory)
            ? language.t("toast.permissions.autoaccept.on.title")
            : language.t("toast.permissions.autoaccept.off.title"),
          description: permission.isAutoAccepting(sessionID, sdk.directory)
            ? language.t("toast.permissions.autoaccept.on.description")
            : language.t("toast.permissions.autoaccept.off.description"),
        })
      },
    },
    {
      id: "session.undo",
      title: language.t("command.session.undo"),
      description: language.t("command.session.undo.description"),
      category: language.t("command.category.session"),
      slash: "undo",
      disabled: !params.id || visibleUserMessages().length === 0,
      onSelect: async () => {
        const sessionID = params.id
        if (!sessionID) return
        if (status()?.type !== "idle") {
          await sdk.client.session.abort({ sessionID }).catch(() => {})
        }
        const revert = info()?.revert?.messageID
        // Find the last user message that's not already reverted
        const message = findLast(userMessages(), (x) => !revert || x.id < revert)
        if (!message) return
        await sdk.client.session.revert({ sessionID, messageID: message.id })
        // Restore the prompt from the reverted message
        const parts = sessionSyncData().part[message.id]
        if (parts) {
          const restored = extractPromptFromParts(parts, { directory: sdk.directory })
          prompt.set(restored)
        }
        // Navigate to the message before the reverted one (which will be the new last visible message)
        const priorMessage = findLast(userMessages(), (x) => x.id < message.id)
        setActiveMessage(priorMessage)
      },
    },
    {
      id: "session.redo",
      title: language.t("command.session.redo"),
      description: language.t("command.session.redo.description"),
      category: language.t("command.category.session"),
      slash: "redo",
      disabled: !params.id || !info()?.revert?.messageID,
      onSelect: async () => {
        const sessionID = params.id
        if (!sessionID) return
        const revertMessageID = info()?.revert?.messageID
        if (!revertMessageID) return
        const nextMessage = userMessages().find((x) => x.id > revertMessageID)
        if (!nextMessage) {
          // Full unrevert - restore all messages and navigate to last
          await sdk.client.session.unrevert({ sessionID })
          prompt.reset()
          // Navigate to the last message (the one that was at the revert point)
          const lastMsg = findLast(userMessages(), (x) => x.id >= revertMessageID)
          setActiveMessage(lastMsg)
          return
        }
        // Partial redo - move forward to next message
        await sdk.client.session.revert({ sessionID, messageID: nextMessage.id })
        // Navigate to the message before the new revert point
        const priorMsg = findLast(userMessages(), (x) => x.id < nextMessage.id)
        setActiveMessage(priorMsg)
      },
    },
    {
      id: "session.compact",
      title: language.t("command.session.compact"),
      description: language.t("command.session.compact.description"),
      category: language.t("command.category.session"),
      slash: "compact",
      disabled: !params.id || visibleUserMessages().length === 0,
      onSelect: async () => {
        const sessionID = params.id
        if (!sessionID) return
        const model = local.model.current()
        if (!model) {
          showToast({
            title: language.t("toast.model.none.title"),
            description: language.t("toast.model.none.description"),
          })
          return
        }
        await sdk.client.session.summarize({
          sessionID,
          modelID: model.id,
          providerID: model.provider.id,
        })
      },
    },
    {
      id: "session.fork",
      title: language.t("command.session.fork"),
      description: language.t("command.session.fork.description"),
      category: language.t("command.category.session"),
      slash: "fork",
      disabled: !params.id || visibleUserMessages().length === 0,
      onSelect: () => dialog.show(() => <DialogFork />),
    },
    ...(sync.data.config.share !== "disabled"
      ? [
          {
            id: "session.share",
            title: language.t("command.session.share"),
            description: language.t("command.session.share.description"),
            category: language.t("command.category.session"),
            slash: "share",
            disabled: !params.id || !!info()?.share?.url,
            onSelect: async () => {
              if (!params.id) return
              await sdk.client.session
                .share({ sessionID: params.id })
                .then((res) => {
                  navigator.clipboard.writeText(res.data!.share!.url).catch(() =>
                    showToast({
                      title: language.t("toast.session.share.copyFailed.title"),
                      variant: "error",
                    }),
                  )
                })
                .then(() =>
                  showToast({
                    title: language.t("toast.session.share.success.title"),
                    description: language.t("toast.session.share.success.description"),
                    variant: "success",
                  }),
                )
                .catch(() =>
                  showToast({
                    title: language.t("toast.session.share.failed.title"),
                    description: language.t("toast.session.share.failed.description"),
                    variant: "error",
                  }),
                )
            },
          },
          {
            id: "session.unshare",
            title: language.t("command.session.unshare"),
            description: language.t("command.session.unshare.description"),
            category: language.t("command.category.session"),
            slash: "unshare",
            disabled: !params.id || !info()?.share?.url,
            onSelect: async () => {
              if (!params.id) return
              await sdk.client.session
                .unshare({ sessionID: params.id })
                .then(() =>
                  showToast({
                    title: language.t("toast.session.unshare.success.title"),
                    description: language.t("toast.session.unshare.success.description"),
                    variant: "success",
                  }),
                )
                .catch(() =>
                  showToast({
                    title: language.t("toast.session.unshare.failed.title"),
                    description: language.t("toast.session.unshare.failed.description"),
                    variant: "error",
                  }),
                )
            },
          },
        ]
      : []),
  ])

  const handleKeyDown = (event: KeyboardEvent) => {
    const activeElement = document.activeElement as HTMLElement | undefined
    if (activeElement) {
      const isProtected = activeElement.closest("[data-prevent-autofocus]")
      const isInput = /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(activeElement.tagName) || activeElement.isContentEditable
      if (isProtected || isInput) return
    }
    if (dialog.active) return

    if (activeElement === inputRef) {
      if (event.key === "Escape") inputRef?.blur()
      return
    }

    // Don't autofocus chat if terminal panel is open
    if (view().terminal.opened()) return

    // Only treat explicit scroll keys as potential "user scroll" gestures.
    if (event.key === "PageUp" || event.key === "PageDown" || event.key === "Home" || event.key === "End") {
      markScrollGesture()
      return
    }

    if (event.key.length === 1 && event.key !== "Unidentified" && !(event.ctrlKey || event.metaKey)) {
      inputRef?.focus()
    }
  }

  const handleDragStart = (event: unknown) => {
    const id = getDraggableId(event)
    if (!id) return
    setStore("activeDraggable", id)
  }

  const handleDragOver = (event: DragEvent) => {
    const { draggable, droppable } = event
    if (draggable && droppable) {
      const currentTabs = tabs().all()
      const fromIndex = currentTabs?.indexOf(draggable.id.toString())
      const toIndex = currentTabs?.indexOf(droppable.id.toString())
      if (fromIndex !== toIndex && toIndex !== undefined) {
        tabs().move(draggable.id.toString(), toIndex)
      }
    }
  }

  const handleDragEnd = () => {
    setStore("activeDraggable", undefined)
  }

  const handleTerminalDragStart = (event: unknown) => {
    const id = getDraggableId(event)
    if (!id) return
    setStore("activeTerminalDraggable", id)
  }

  const handleTerminalDragOver = (event: DragEvent) => {
    const { draggable, droppable } = event
    if (draggable && droppable) {
      const terminals = terminal.all()
      const fromIndex = terminals.findIndex((t: LocalPTY) => t.id === draggable.id.toString())
      const toIndex = terminals.findIndex((t: LocalPTY) => t.id === droppable.id.toString())
      if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
        terminal.move(draggable.id.toString(), toIndex)
      }
    }
  }

  const handleTerminalDragEnd = () => {
    setStore("activeTerminalDraggable", undefined)
    const activeId = terminal.active()
    if (!activeId) return
    setTimeout(() => {
      const wrapper = document.getElementById(`terminal-wrapper-${activeId}`)
      const element = wrapper?.querySelector('[data-component="terminal"]') as HTMLElement
      if (!element) return

      // Find and focus the ghostty textarea (the actual input element)
      const textarea = element.querySelector("textarea") as HTMLTextAreaElement
      if (textarea) {
        textarea.focus()
        return
      }
      // Fallback: focus container and dispatch pointer event
      element.focus()
      element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }))
    }, 0)
  }

  const contextOpen = createMemo(
    () => auth.canFeature("files") && (tabs().active() === "context" || tabs().all().includes("context")),
  )
  const openedTabs = createMemo(() =>
    tabs()
      .all()
      .filter((tab) => tab !== "context"),
  )

  const mobileReview = createMemo(() => !isDesktop() && store.mobileTab === "git")

  const fileTreeTab = () => layout.fileTree.tab()
  const setFileTreeTab = (value: "all" | "git" | "history") => layout.fileTree.setTab(value)

  const [tree, setTree] = createStore({
    reviewScroll: undefined as HTMLDivElement | undefined,
    pendingDiff: undefined as string | undefined,
    activeDiff: undefined as string | undefined,
  })

  const reviewScroll = () => tree.reviewScroll
  const setReviewScroll = (value: HTMLDivElement | undefined) => setTree("reviewScroll", value)
  const pendingDiff = () => tree.pendingDiff
  const setPendingDiff = (value: string | undefined) => setTree("pendingDiff", value)
  const activeDiff = () => tree.activeDiff
  const setActiveDiff = (value: string | undefined) => setTree("activeDiff", value)

  const gitHeaders = () => {
    const headers: Record<string, string> = {}
    if (auth.token) headers["Authorization"] = `Bearer ${auth.token}`
    return headers
  }

  const sessionDirectoryRoot = () => {
    const actualDir = actualSessionDir()
    if (typeof actualDir === "string" && actualDir) return actualDir
    if (typeof sdk.directory === "string" && sdk.directory) return sdk.directory
    return ""
  }

  const historyProject = createMemo(() => {
    const id = selectedHistoryProject()
    if (!id) return gitHistoryProjects()[0]
    return gitHistoryProjects().find((item) => item.id === id) ?? gitHistoryProjects()[0]
  })

  const historyDirectory = () => historyProject()?.directory || sessionDirectoryRoot()
  const historyVcsDirectory = () => historyProject()?.directory || sessionDirectoryRoot()
  const historyWorkspaceID = () => info()?.workspaceID
  const historyRoot = createMemo(() =>
    (info()?.roots ?? []).find((item) => {
      const project = historyProject()
      if (!project) return false
      return (
        item.projectID === project.id ||
        item.sessionWorktreeDirectory === project.directory ||
        item.sourceDirectory === project.directory
      )
    }),
  )
  const historyCurrentCommit = createMemo(() =>
    gitHistory().items.find((item) => item.refs.some((ref) => ref.kind === "head")),
  )
  const historyCurrentBranch = createMemo(() => {
    if (gitHistoryVcs().branch) return gitHistoryVcs().branch

    if (historyRoot()?.branch) return historyRoot()?.branch

    const head = historyCurrentCommit()
    const ref =
      head?.refs.find((item) => item.kind === "local") ??
      head?.refs.find((item) => item.kind === "remote")
    if (ref?.name) return ref.name

    return sessionSyncData().vcs?.branch
  })

  const historyPath = (path: string) => {
    const prefix = historyProject()?.prefix
    return prefix ? `${prefix}/${path}` : path
  }

  const withHistoryPath = (detail: SessionGitCommitDetailValue) => {
    return {
      ...detail,
      files: detail.files.map((file) => ({
        ...file,
        path: historyPath(file.path),
      })),
      diffs: detail.diffs.map((diff) => ({
        ...diff,
        file: historyPath(diff.file),
      })),
    }
  }

  const historyWorkingTreeCounts = createMemo(() => {
    const out = {
      added: 0,
      modified: 0,
      deleted: 0,
    }
    for (const file of gitHistoryStatus()) {
      if (file.status === "added") out.added += 1
      else if (file.status === "deleted") out.deleted += 1
      else out.modified += 1
    }
    return out
  })

  const historyWorkingTreeSummary = createMemo(() => {
    const count = historyWorkingTreeCounts()
    const parts = [
      count.modified ? `${count.modified} modified` : "",
      count.added ? `${count.added} added` : "",
      count.deleted ? `${count.deleted} deleted` : "",
    ].filter(Boolean)
    if (parts.length > 0) return parts.join(" · ")
    if (gitHistoryDiffsReady()) return "Clean working tree"
    return "Loading working tree"
  })

  const historyWorkingTreeDetail = createMemo<SessionGitCommitDetailValue | undefined>(() => {
    if (!gitHistoryDiffsReady() && gitHistoryStatus().length === 0 && gitHistoryDiffs().length === 0) return
    return {
      oid: HISTORY_WORKING_TREE_ID,
      short: "working-tree",
      parents: [],
      author_name: "Working tree",
      author_email: "",
      authored_at: Date.now(),
      refs: [
        { kind: "head", name: "HEAD" },
        ...(historyCurrentBranch() ? [{ kind: "local" as const, name: historyCurrentBranch()! }] : []),
        ...(gitHistoryVcs().tracking ? [{ kind: "remote" as const, name: gitHistoryVcs().tracking! }] : []),
      ],
      subject: "Working tree",
      body: historyWorkingTreeSummary(),
      files: gitHistoryStatus().map((file) => ({
        path: file.path,
        additions: file.added,
        deletions: file.removed,
        status: file.status,
      })),
      diffs: gitHistoryDiffs(),
    }
  })

  createEffect(
    on(
      () =>
        [
          historyWorkspaceID(),
          info()?.projectID,
          sessionDirectoryRoot(),
          sdk.url,
          auth.token,
          (info()?.roots ?? [])
            .map((item) =>
              [
                item.projectID,
                item.slug,
                item.name,
                item.sourceDirectory,
                item.sessionWorktreeDirectory,
                item.branch,
                item.primary,
              ]
                .filter(Boolean)
                .join(":"),
            )
            .join("|"),
        ] as const,
      async ([workspaceID, sessionProjectID, sessionDir]) => {
        const request = ++gitHistoryProjectsRequest
        const prefix = (directory: string) => {
          if (!sessionDir || directory === sessionDir) return ""
          return directory.startsWith(`${sessionDir}/`) ? directory.slice(sessionDir.length + 1) : ""
        }
        const mergeProjects = (items: GitHistoryProject[]) => {
          const seen = new Set<string>()
          return items.filter((item) => {
            if (!item.directory) return false
            if (seen.has(item.directory)) return false
            seen.add(item.directory)
            return true
          })
        }

        const fallback = [
          {
            id: sessionProjectID || sessionDir || "default",
            directory: sessionDir,
            label: currentProject()?.name || getFilename(sessionDir),
            prefix: prefix(sessionDir),
          },
        ].filter((item): item is GitHistoryProject => !!item.directory)
        const roots = (info()?.roots ?? [])
          .filter((item) => !!item.projectID && !!item.sessionWorktreeDirectory)
          .map((item) => ({
            id: item.projectID,
            directory: item.sessionWorktreeDirectory,
            label: item.name?.trim() || item.slug || getFilename(item.sourceDirectory),
            prefix: prefix(item.sessionWorktreeDirectory),
            branch: item.branch,
          }))

        if (roots.length > 0) {
          if (request !== gitHistoryProjectsRequest) return
          const next = mergeProjects(roots)
          setGitHistoryProjects(next)
          setSelectedHistoryProject((prev) => {
            if (prev && next.some((item) => item.id === prev)) return prev
            const current = next.find((item) => item.id === sessionProjectID)
            if (current) return current.id
            const primary = (info()?.roots ?? []).find((item) => item.primary)
            if (primary && next.some((item) => item.id === primary.projectID)) return primary.projectID
            return next[0]?.id
          })
          return
        }

        const workspaceKey = workspaceID
        if (!workspaceKey) {
          if (request !== gitHistoryProjectsRequest) return
          const next = mergeProjects(fallback)
          setGitHistoryProjects(next)
          setSelectedHistoryProject(next[0]?.id)
          return
        }

        const workspace = await workspaceFetch<WorkspaceInfo>(
          sdk.url,
          `/workspace/${encodeURIComponent(workspaceKey)}`,
          { token: auth.token ?? undefined, fetchFn: platform.fetch ?? fetch },
        ).catch(() => undefined)

        if (request !== gitHistoryProjectsRequest) return
        if (!workspace?.projects?.length) {
          const next = mergeProjects(fallback)
          setGitHistoryProjects(next)
          setSelectedHistoryProject(next[0]?.id)
          return
        }

        const projects = workspace.projects
          .filter((item) => !!item.sourceDirectory)
          .map((item) => ({
            id: item.projectID,
            directory: item.sourceDirectory,
            label: item.name?.trim() || item.slug || getFilename(item.sourceDirectory),
            prefix: prefix(item.sourceDirectory),
          }))

        const next = mergeProjects(projects.length > 0 ? projects : fallback)
        setGitHistoryProjects(next)
        setSelectedHistoryProject((prev) => {
          if (prev && next.some((item) => item.id === prev)) return prev
          const current = next.find((item) => item.id === sessionProjectID)
          if (current) return current.id
          return next[0]?.id
        })
      },
      { defer: true },
    ),
  )

  const fetchGitHistory = async (cursor?: string) => {
    const dir = historyDirectory()
    if (!dir) return

    const request = ++gitHistoryRequest
    if (cursor) setGitHistoryLoadingMore(true)
    else setGitHistoryLoading(true)

    try {
      const search = new URLSearchParams({
        directory: dir,
        limit: cursor ? "300" : "500",
      })
      if (cursor) search.set("cursor", cursor)

      const res = await (platform.fetch ?? fetch)(`${String(sdk.url)}/git/history?${search.toString()}`, {
        headers: gitHeaders(),
      })
      if (!res.ok) throw new Error(res.statusText)

      const data = (await res.json()) as GitHistoryPage
      if (request !== gitHistoryRequest) return

      setGitHistory((prev) => ({
        items: cursor ? [...prev.items, ...data.items] : data.items,
        next: data.next,
      }))

      const current = selectedHistoryCommit()
      if (cursor) return
      if (!current && data.items[0]) {
        setSelectedHistoryCommit(data.items[0].oid)
        return
      }
      if (current && data.items.some((item) => item.oid === current)) return
      setSelectedHistoryCommit(data.items[0]?.oid)
    } catch {
      if (request !== gitHistoryRequest) return
      if (!cursor) {
        setGitHistory({ items: [], next: undefined })
        setSelectedHistoryCommit(undefined)
        setGitHistoryCommit(undefined)
      }
    } finally {
      if (request !== gitHistoryRequest) return
      if (cursor) setGitHistoryLoadingMore(false)
      else setGitHistoryLoading(false)
    }
  }

  const fetchHistoryVcs = async () => {
    const dir = historyVcsDirectory()
    if (!dir) return

    setGitHistoryVcs({ loading: true })
    try {
      const url = new URL("/vcs", sdk.url)
      url.searchParams.set("directory", dir)
      url.searchParams.set("detail", "true")
      const res = await (platform.fetch ?? fetch)(url.toString(), {
        headers: gitHeaders(),
      })
      if (!res.ok) throw new Error(res.statusText)
      const data = await res.json()
      setGitHistoryVcs({
        loading: false,
        branch: data.branch,
        tracking: data.tracking,
        worktree: data.worktree,
      })
    } catch {
      setGitHistoryVcs({ loading: false })
    }
  }

  const fetchHistoryWorkingTree = async () => {
    const dir = historyVcsDirectory()
    if (!dir) return

    const request = ++gitHistoryStatusRequest
    setGitHistoryDiffsReady(false)
    try {
      const [status, diffs] = await Promise.all([
        sdk.client.file.status({ directory: dir }),
        (platform.fetch ?? fetch)(`${String(sdk.url)}/file/diff?directory=${encodeURIComponent(dir)}`, {
          headers: gitHeaders(),
        }).then((res) => {
          if (!res.ok) throw new Error(res.statusText)
          return res.json() as Promise<FileDiff[]>
        }),
      ])
      if (request !== gitHistoryStatusRequest) return
      setGitHistoryStatus((status.data ?? []).map((item) => ({ ...item, path: historyPath(item.path) })))
      setGitHistoryDiffs(diffs.map((item) => ({ ...item, file: historyPath(item.file) })))
    } catch {
      if (request !== gitHistoryStatusRequest) return
      setGitHistoryStatus([])
      setGitHistoryDiffs([])
    } finally {
      if (request !== gitHistoryStatusRequest) return
      setGitHistoryDiffsReady(true)
      if (!selectedHistoryCommit() && gitHistoryStatus().length > 0) {
        setSelectedHistoryCommit(HISTORY_WORKING_TREE_ID)
      }
    }
  }

  const fetchSelectedCommit = async (oid: string) => {
    if (oid === HISTORY_WORKING_TREE_ID) {
      setGitHistoryCommit(historyWorkingTreeDetail())
      setGitHistoryCommitLoading(false)
      return
    }
    const dir = historyDirectory()
    if (!dir) return

    const request = ++gitCommitRequest
    setGitHistoryCommitLoading(true)

    try {
      const search = new URLSearchParams({
        directory: dir,
        oid,
      })
      const res = await (platform.fetch ?? fetch)(`${String(sdk.url)}/git/commit?${search.toString()}`, {
        headers: gitHeaders(),
      })
      if (!res.ok) throw new Error(res.statusText)

      const data = withHistoryPath((await res.json()) as SessionGitCommitDetailValue)
      if (request !== gitCommitRequest) return
      setGitHistoryCommit(data)
    } catch {
      if (request !== gitCommitRequest) return
      setGitHistoryCommit(undefined)
    } finally {
      if (request !== gitCommitRequest) return
      setGitHistoryCommitLoading(false)
    }
  }

  const refreshGitHistory = async () => {
    const dir = historyDirectory()
    if (dir) {
      await (platform.fetch ?? fetch)(`${String(sdk.url)}/branch/refresh`, {
        method: "POST",
        headers: {
          ...gitHeaders(),
          "content-type": "application/json",
        },
        body: JSON.stringify({ directory: dir }),
      }).catch(() => undefined)
    }
    await fetchGitHistory()
    await fetchHistoryVcs()
    await fetchHistoryWorkingTree()
    const oid = selectedHistoryCommit()
    if (!oid) return
    await fetchSelectedCommit(oid)
  }

  const refreshFileTree = async () => {
    if (fileTreeRefreshing()) return
    setFileTreeRefreshing(true)
    try {
      const tab = fileTreeTab()
      if (tab === "history") {
        await refreshGitHistory()
        return
      }
      if (tab === "git") {
        setGitRefresh((x) => x + 1)
        await file.tree.refresh("")
        return
      }
      await Promise.all([file.tree.refresh(""), file.tree.refresh(".tmp"), file.tree.refresh(".tmp/attachments")])
    } finally {
      setFileTreeRefreshing(false)
    }
  }

  const showAllFiles = () => {
    if (!auth.canFeature("files")) return
    if (fileTreeTab() !== "git") return
    setFileTreeTab("all")
  }

  const reviewPanel = () => (
    <div class="flex flex-col h-full overflow-hidden bg-background-stronger contain-strict">
      <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
        <Switch>
          <Match when={reviewHasChanges()}>
            <Show
              when={reviewReady()}
              fallback={<div class="px-6 py-4 text-text-weak">{language.t("session.review.loadingChanges")}</div>}
            >
              <SessionReviewTab
                diffs={reviewDiffs}
                view={view}
                diffStyle={layout.review.diffStyle()}
                onDiffStyleChange={layout.review.setDiffStyle}
                onScrollRef={setReviewScroll}
                focusedFile={activeDiff()}
                readFile={file.readFile}
                onLineComment={
                  auth.canFeature("files")
                    ? (comment) => addCommentToContext({ ...comment, origin: "review" })
                    : undefined
                }
                comments={comments.all()}
                focusedComment={comments.focus()}
                onFocusedCommentChange={comments.setFocus}
                onViewFile={viewReviewFile}
              />
            </Show>
          </Match>
          <Match when={true}>
            <div class="h-full px-6 pb-30 flex flex-col items-center justify-center text-center gap-6">
              <Mark class="w-14 opacity-10" />
              <div class="text-14-regular text-text-weak max-w-56">{language.t("session.git.noChanges")}</div>
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  )

  createEffect(
    on(
      () => tabs().active(),
      (active) => {
        if (!active) return
        if (fileTreeTab() !== "git") return
        if (!file.pathFromTab(active)) return
        showAllFiles()
      },
      { defer: true },
    ),
  )

  const setFileTreeTabValue = (value: string) => {
    if (value !== "all" && value !== "git" && value !== "history") return
    setFileTreeTab(value)
  }

  const reviewDiffId = (path: string) => {
    const sum = checksum(path)
    if (!sum) return
    return `session-review-diff-${sum}`
  }

  const reviewDiffTop = (path: string) => {
    const root = reviewScroll()
    if (!root) return

    const id = reviewDiffId(path)
    if (!id) return

    const el = document.getElementById(id)
    if (!(el instanceof HTMLElement)) return
    if (!root.contains(el)) return

    const a = el.getBoundingClientRect()
    const b = root.getBoundingClientRect()
    return a.top - b.top + root.scrollTop
  }

  const scrollToReviewDiff = (path: string) => {
    const root = reviewScroll()
    if (!root) return false

    const top = reviewDiffTop(path)
    if (top === undefined) return false

    view().setScroll("review", { x: root.scrollLeft, y: top })
    root.scrollTo({ top, behavior: "auto" })
    return true
  }

  const focusReviewDiff = (path: string) => {
    const current = view().review.open() ?? []
    if (!current.includes(path)) view().review.setOpen([...current, path])
    setActiveDiff(path)
    setPendingDiff(path)
  }

  createEffect(() => {
    const pending = pendingDiff()
    if (!pending) return
    if (!reviewScroll()) return
    const ready = gitDiffsReady()
    if (!ready) return

    const attempt = (count: number) => {
      if (pendingDiff() !== pending) return
      if (count > 60) {
        setPendingDiff(undefined)
        return
      }

      const root = reviewScroll()
      if (!root) {
        requestAnimationFrame(() => attempt(count + 1))
        return
      }

      if (!scrollToReviewDiff(pending)) {
        requestAnimationFrame(() => attempt(count + 1))
        return
      }

      const top = reviewDiffTop(pending)
      if (top === undefined) {
        requestAnimationFrame(() => attempt(count + 1))
        return
      }

      if (Math.abs(root.scrollTop - top) <= 1) {
        setPendingDiff(undefined)
        return
      }

      requestAnimationFrame(() => attempt(count + 1))
    }

    requestAnimationFrame(() => attempt(0))
  })

  const activeTab = createMemo(() => {
    const active = tabs().active()
    if (active === "context") return "context"
    if (active && file.pathFromTab(active)) return normalizeTab(active)

    const first = openedTabs()[0]
    if (first) return first
    if (contextOpen()) return "context"
    return "empty"
  })

  createEffect(() => {
    if (!layout.ready()) return
    if (tabs().active()) return
    if (openedTabs().length === 0 && !contextOpen()) return

    const next = activeTab()
    if (next === "empty") return
    tabs().setActive(next)
  })

  createEffect(() => {
    if (!isDesktop()) return
    if (!layout.fileTree.opened()) return
    if (sync.status === "loading") return

    fileTreeTab()
    void file.tree.list("")
  })

  const gitStatusFiles = createMemo(() => gitStatus().map((f) => f.path))
  const gitStatusKinds = createMemo(() => {
    const merge = (a: "add" | "del" | "mix" | undefined, b: "add" | "del" | "mix") => {
      if (!a) return b
      if (a === b) return a
      return "mix" as const
    }
    const out = new Map<string, "add" | "del" | "mix">()
    for (const f of gitStatus()) {
      const kind = f.status === "added" ? "add" : f.status === "deleted" ? "del" : "mix"
      out.set(f.path, kind)
      const parts = f.path.split("/")
      for (const [idx] of parts.slice(0, -1).entries()) {
        const dir = parts.slice(0, idx + 1).join("/")
        if (!dir) continue
        out.set(dir, merge(out.get(dir), kind))
      }
    }
    return out
  })

  createEffect(
    on(
      () => [
        layout.fileTree.opened(),
        fileTreeTab(),
        actualSessionDir(),
        sdk.directory,
        sdk.url,
        auth.token,
        gitRefresh(),
      ],
      ([opened, tab, actualDir, sdkDir, url, token, refresh]) => {
        if (!opened) return
        if (tab !== "git") return

        const dir = typeof actualDir === "string" && actualDir ? actualDir : typeof sdkDir === "string" ? sdkDir : ""
        if (!dir) return
        const request = ++gitStatusRequest
        const headers: Record<string, string> = {}
        if (typeof token === "string" && token) headers["Authorization"] = `Bearer ${token}`
        setGitDiffsReady(false)
        Promise.all([
          sdk.client.file.status({ directory: dir }),
          (platform.fetch ?? fetch)(`${String(url)}/file/diff?directory=${encodeURIComponent(dir)}`, { headers }).then(
            (res) => {
              if (!res.ok) throw new Error(res.statusText)
              return res.json() as Promise<FileDiff[]>
            },
          ),
        ])
          .then(([status, diffs]) => {
            if (request !== gitStatusRequest) return
            setGitStatus(status.data ?? [])
            setGitDiffs(diffs)
          })
          .catch(() => {
            if (request !== gitStatusRequest) return
            setGitStatus([])
            setGitDiffs([])
          })
          .finally(() => {
            if (request !== gitStatusRequest) return
            setGitDiffsReady(true)
          })
      },
      { defer: true },
    ),
  )

  createEffect(() => {
    const stop = globalSDK.event.listen((e) => {
      const event = e.details
      if (
        event.type !== "file.watcher.updated" &&
        event.type !== "file.edited" &&
        event.type !== "session.updated" &&
        event.type !== "message.updated" &&
        event.type !== "message.part.updated"
      )
        return
      const dir = actualSessionDir() || sdk.directory
      if (e.name !== dir) return
      if (
        event.type !== "file.watcher.updated" &&
        event.type !== "file.edited" &&
        event.type !== "message.updated" &&
        event.type !== "session.updated"
      )
        return
      if (!layout.fileTree.opened()) return
      if (fileTreeTab() !== "git") return
      setGitRefresh((x) => x + 1)
    })
    onCleanup(stop)
  })

  const reviewDiffs = createMemo(() => gitDiffs())
  const reviewReady = createMemo(() => gitDiffsReady())
  const reviewHasChanges = createMemo(() => gitDiffs().length > 0)
  const viewReviewFile = (path: string) => {
    if (fileTreeTab() === "git") setFileTreeTab("all")
    const value = file.tab(path)
    tabs().open(value)
    file.load(path)
  }

  createEffect(
    on(
      () => [layout.fileTree.opened(), fileTreeTab(), historyDirectory(), selectedHistoryProject(), sdk.url, auth.token] as const,
      ([opened, tab, dir]) => {
        if (!opened) return
        if (tab !== "history") return
        if (!dir) return
        void fetchGitHistory()
        void fetchHistoryVcs()
        void fetchHistoryWorkingTree()
      },
      { defer: true },
    ),
  )

  createEffect(
    on(
      () => [gitHistoryProjects(), selectedHistoryProject(), fileTreeTab()] as const,
      ([projects, selected, tab]) => {
        if (tab !== "history") return
      },
      { defer: true },
    ),
  )

  createEffect(
    on(
      () => [fileTreeTab(), selectedHistoryCommit(), historyDirectory(), selectedHistoryProject()] as const,
      ([tab, oid, dir]) => {
        if (tab !== "history") return
        if (!oid || !dir) {
          setGitHistoryCommit(undefined)
          return
        }
        void fetchSelectedCommit(oid)
      },
      { defer: true },
    ),
  )

  const loadMoreGitHistory = () => {
    const next = gitHistory().next
    if (!next) return
    void fetchGitHistory(next)
  }

  const openHistoryFile = (path: string) => {
    setFileTreeTab("all")
    const value = file.tab(path)
    tabs().open(value)
    file.load(path)
  }

  const autoScroll = createAutoScroll({
    working: () => true,
    overflowAnchor: "dynamic",
  })

  const clearMessageHash = () => {
    if (!window.location.hash) return
    window.history.replaceState(null, "", window.location.href.replace(/#.*$/, ""))
  }

  const resumeScroll = () => {
    setStore("messageId", undefined)
    autoScroll.forceScrollToBottom()
    clearMessageHash()
  }

  // When the user returns to the bottom, treat the active message as "latest".
  createEffect(
    on(
      autoScroll.userScrolled,
      (scrolled) => {
        if (scrolled) return
        setStore("messageId", undefined)
        clearMessageHash()
      },
      { defer: true },
    ),
  )

  let scrollSpyFrame: number | undefined
  let scrollSpyTarget: HTMLDivElement | undefined

  const anchor = (id: string) => `message-${id}`

  const setScrollRef = (el: HTMLDivElement | undefined) => {
    scroller = el
    autoScroll.scrollRef(el)
  }

  const turnInit = 20
  const turnBatch = 20
  let turnHandle: number | undefined
  let turnIdle = false

  function cancelTurnBackfill() {
    const handle = turnHandle
    if (handle === undefined) return
    turnHandle = undefined

    if (turnIdle && window.cancelIdleCallback) {
      window.cancelIdleCallback(handle)
      return
    }

    clearTimeout(handle)
  }

  function scheduleTurnBackfill() {
    if (turnHandle !== undefined) return
    if (store.turnStart <= 0) return

    if (window.requestIdleCallback) {
      turnIdle = true
      turnHandle = window.requestIdleCallback(() => {
        turnHandle = undefined
        backfillTurns()
      })
      return
    }

    turnIdle = false
    turnHandle = window.setTimeout(() => {
      turnHandle = undefined
      backfillTurns()
    }, 0)
  }

  function backfillTurns() {
    const start = store.turnStart
    if (start <= 0) return

    const next = start - turnBatch
    const nextStart = next > 0 ? next : 0

    const el = scroller
    if (!el) {
      setStore("turnStart", nextStart)
      scheduleTurnBackfill()
      return
    }

    const beforeTop = el.scrollTop
    const beforeHeight = el.scrollHeight

    setStore("turnStart", nextStart)

    requestAnimationFrame(() => {
      const delta = el.scrollHeight - beforeHeight
      if (!delta) return
      el.scrollTop = beforeTop + delta
    })

    scheduleTurnBackfill()
  }

  createEffect(
    on(
      () => [params.id, messagesReady()] as const,
      ([id, ready]) => {
        cancelTurnBackfill()
        setStore("turnStart", 0)
        if (!id || !ready) return

        const len = visibleUserMessages().length
        const start = len > turnInit ? len - turnInit : 0
        setStore("turnStart", start)
        scheduleTurnBackfill()
      },
      { defer: true },
    ),
  )

  createResizeObserver(
    () => promptDock,
    ({ height }) => {
      const next = Math.ceil(height)

      if (next === store.promptHeight) return

      const el = scroller
      const stick = el ? el.scrollHeight - el.clientHeight - el.scrollTop < 10 : false

      setStore("promptHeight", next)

      if (stick && el) {
        requestAnimationFrame(() => {
          el.scrollTo({ top: el.scrollHeight, behavior: "auto" })
        })
      }
    },
  )

  const updateHash = (id: string) => {
    window.history.replaceState(null, "", `#${anchor(id)}`)
  }

  createEffect(() => {
    const sessionID = params.id
    if (!sessionID) return
    const raw = sessionStorage.getItem("opencode.pendingMessage")
    if (!raw) return
    const parts = raw.split("|")
    const pendingSessionID = parts[0]
    const messageID = parts[1]
    if (!pendingSessionID || !messageID) return
    if (pendingSessionID !== sessionID) return

    sessionStorage.removeItem("opencode.pendingMessage")
    setUi("pendingMessage", messageID)
  })

  const scrollToElement = (el: HTMLElement, behavior: ScrollBehavior) => {
    const root = scroller
    if (!root) return false

    const a = el.getBoundingClientRect()
    const b = root.getBoundingClientRect()
    const top = a.top - b.top + root.scrollTop
    root.scrollTo({ top, behavior })
    return true
  }

  const scrollToMessage = (message: UserMessage, behavior: ScrollBehavior = "smooth") => {
    setActiveMessage(message)

    const msgs = visibleUserMessages()
    const index = msgs.findIndex((m) => m.id === message.id)
    if (index !== -1 && index < store.turnStart) {
      setStore("turnStart", index)
      scheduleTurnBackfill()

      requestAnimationFrame(() => {
        const el = document.getElementById(anchor(message.id))
        if (!el) {
          requestAnimationFrame(() => {
            const next = document.getElementById(anchor(message.id))
            if (!next) return
            scrollToElement(next, behavior)
          })
          return
        }
        scrollToElement(el, behavior)
      })

      updateHash(message.id)
      return
    }

    const el = document.getElementById(anchor(message.id))
    if (!el) {
      updateHash(message.id)
      requestAnimationFrame(() => {
        const next = document.getElementById(anchor(message.id))
        if (!next) return
        if (!scrollToElement(next, behavior)) return
      })
      return
    }
    if (scrollToElement(el, behavior)) {
      updateHash(message.id)
      return
    }

    requestAnimationFrame(() => {
      const next = document.getElementById(anchor(message.id))
      if (!next) return
      if (!scrollToElement(next, behavior)) return
    })
    updateHash(message.id)
  }

  const applyHash = (behavior: ScrollBehavior) => {
    const hash = window.location.hash.slice(1)
    if (!hash) {
      autoScroll.forceScrollToBottom()
      return
    }

    const match = hash.match(/^message-(.+)$/)
    if (match) {
      autoScroll.pause()
      const msg = visibleUserMessages().find((m) => m.id === match[1])
      if (msg) {
        scrollToMessage(msg, behavior)
        return
      }

      // If we have a message hash but the message isn't loaded/rendered yet,
      // don't fall back to "bottom". We'll retry once messages arrive.
      return
    }

    const target = document.getElementById(hash)
    if (target) {
      autoScroll.pause()
      scrollToElement(target, behavior)
      return
    }

    autoScroll.forceScrollToBottom()
  }

  const closestMessage = (node: Element | null): HTMLElement | null => {
    if (!node) return null
    const match = node.closest?.("[data-message-id]") as HTMLElement | null
    if (match) return match
    const root = node.getRootNode?.()
    if (root instanceof ShadowRoot) return closestMessage(root.host)
    return null
  }

  const getActiveMessageId = (container: HTMLDivElement) => {
    const rect = container.getBoundingClientRect()
    if (!rect.width || !rect.height) return

    const x = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2))
    const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + 100))

    const hit = document.elementFromPoint(x, y)
    const host = closestMessage(hit)
    const id = host?.dataset.messageId
    if (id) return id

    // Fallback: DOM query (handles edge hit-testing cases)
    const cutoff = container.scrollTop + 100
    const nodes = container.querySelectorAll<HTMLElement>("[data-message-id]")
    let last: string | undefined

    for (const node of nodes) {
      const next = node.dataset.messageId
      if (!next) continue
      if (node.offsetTop > cutoff) break
      last = next
    }

    return last
  }

  const scheduleScrollSpy = (container: HTMLDivElement) => {
    scrollSpyTarget = container
    if (scrollSpyFrame !== undefined) return

    scrollSpyFrame = requestAnimationFrame(() => {
      scrollSpyFrame = undefined

      const target = scrollSpyTarget
      scrollSpyTarget = undefined
      if (!target) return

      const id = getActiveMessageId(target)
      if (!id) return
      if (id === store.messageId) return

      setStore("messageId", id)
    })
  }

  createEffect(() => {
    const sessionID = params.id
    const ready = messagesReady()
    if (!sessionID || !ready) return

    requestAnimationFrame(() => {
      applyHash("auto")
    })
  })

  // Retry message navigation once the target message is actually loaded.
  createEffect(() => {
    const sessionID = params.id
    const ready = messagesReady()
    if (!sessionID || !ready) return

    // dependencies
    visibleUserMessages().length
    store.turnStart

    const targetId =
      ui.pendingMessage ??
      (() => {
        const hash = window.location.hash.slice(1)
        const match = hash.match(/^message-(.+)$/)
        if (!match) return undefined
        return match[1]
      })()
    if (!targetId) return
    if (store.messageId === targetId) return

    const msg = visibleUserMessages().find((m) => m.id === targetId)
    if (!msg) return
    if (ui.pendingMessage === targetId) setUi("pendingMessage", undefined)
    autoScroll.pause()
    requestAnimationFrame(() => scrollToMessage(msg, "auto"))
  })

  createEffect(() => {
    const sessionID = params.id
    const ready = messagesReady()
    if (!sessionID || !ready) return

    const handler = () => requestAnimationFrame(() => applyHash("auto"))
    window.addEventListener("hashchange", handler)
    onCleanup(() => window.removeEventListener("hashchange", handler))
  })

  createEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
  })

  const previewPrompt = () =>
    prompt
      .current()
      .map((part) => {
        if (part.type === "file") return `[file:${part.path}]`
        if (part.type === "agent") return `@${part.name}`
        if (part.type === "image") return `[image:${part.filename}]`
        if (part.type === "attachment") return `[attachment:${part.filename}]`
        return part.content
      })
      .join("")
      .trim()

  createEffect(() => {
    if (!prompt.ready()) return
    handoff.prompt = previewPrompt()
  })

  createEffect(() => {
    if (!terminal.ready()) return
    language.locale()

    const label = (pty: LocalPTY) => {
      const title = pty.title
      const number = pty.titleNumber
      const match = title.match(/^Terminal (\d+)$/)
      const parsed = match ? Number(match[1]) : undefined
      const isDefaultTitle = Number.isFinite(number) && number > 0 && Number.isFinite(parsed) && parsed === number

      if (title && !isDefaultTitle) return title
      if (Number.isFinite(number) && number > 0) return language.t("terminal.title.numbered", { number })
      if (title) return title
      return language.t("terminal.title")
    }

    handoff.terminals = terminal.all().map(label)
  })

  createEffect(() => {
    if (!file.ready()) return
    handoff.files = Object.fromEntries(
      tabs()
        .all()
        .flatMap((tab) => {
          const path = file.pathFromTab(tab)
          if (!path) return []
          return [[path, file.selectedLines(path) ?? null] as const]
        }),
    )
  })

  onCleanup(() => {
    cancelTurnBackfill()
    document.removeEventListener("keydown", handleKeyDown)
    if (scrollSpyFrame !== undefined) cancelAnimationFrame(scrollSpyFrame)
  })

  return (
    <div class="relative bg-background-base size-full overflow-hidden flex flex-col">
      <SessionHeader />
      <div class="flex-1 min-h-0 flex flex-col md:flex-row">
        {/* Mobile tab bar */}
        <Show when={!isDesktop() && params.id}>
          <Tabs class="h-auto">
            <Tabs.List>
              <Tabs.Trigger
                value="session"
                class="w-1/2"
                classes={{ button: "w-full" }}
                onClick={() => setStore("mobileTab", "session")}
              >
                {language.t("session.tab.session")}
              </Tabs.Trigger>
              <Tabs.Trigger
                value="git"
                class="w-1/2 !border-r-0"
                classes={{ button: "w-full" }}
                onClick={() => setStore("mobileTab", "git")}
              >
                <Switch>
                  <Match when={hasReview()}>
                    {language.t("session.review.filesChanged", { count: reviewCount() })}
                  </Match>
                  <Match when={true}>{language.t("session.review.change.other")}</Match>
                </Switch>
              </Tabs.Trigger>
            </Tabs.List>
          </Tabs>
        </Show>

        {/* Session panel */}
        <div
          classList={{
            "@container relative shrink-0 flex flex-col min-h-0 h-full bg-background-stronger": true,
            "flex-1 pt-2 md:pt-3": true,
            "md:flex-none": layout.fileTree.opened(),
          }}
          style={{
            width: isDesktop() && layout.fileTree.opened() ? `${layout.session.width()}px` : "100%",
            "--prompt-height": store.promptHeight ? `${store.promptHeight}px` : undefined,
          }}
        >
          <div class="flex-1 min-h-0 overflow-hidden">
            <Switch>
              <Match when={params.id}>
                <Show when={activeMessage()}>
                  <Show
                    when={!mobileReview()}
                    fallback={
                      <div class="relative h-full overflow-hidden">
                        <Switch>
                          <Match when={hasReview()}>
                            <Show
                              when={diffsReady()}
                              fallback={
                                <div class="px-4 py-4 text-text-weak">
                                  {language.t("common.loading")}
                                  {language.t("common.loading.ellipsis")}
                                </div>
                              }
                            >
                              <SessionReviewTab
                                diffs={gitDiffs}
                                view={view}
                                diffStyle="unified"
                                focusedFile={activeDiff()}
                                onLineComment={
                                  auth.canFeature("files")
                                    ? (comment) => addCommentToContext({ ...comment, origin: "review" })
                                    : undefined
                                }
                                comments={comments.all()}
                                focusedComment={comments.focus()}
                                onFocusedCommentChange={comments.setFocus}
                                onViewFile={(path) => {
                                  showAllFiles()
                                  const value = file.tab(path)
                                  tabs().open(value)
                                  file.load(path)
                                }}
                                classes={{
                                  root: "pb-[calc(var(--prompt-height,8rem)+32px)]",
                                  header: "px-4",
                                  container: "px-4",
                                }}
                              />
                            </Show>
                          </Match>
                          <Match when={true}>
                            <div class="h-full px-4 pb-30 flex flex-col items-center justify-center text-center gap-6">
                              <Mark class="w-14 opacity-10" />
                              <div class="text-14-regular text-text-weak max-w-56">
                                {language.t("session.git.noChanges")}
                              </div>
                            </div>
                          </Match>
                        </Switch>
                      </div>
                    }
                  >
                    <div class="relative w-full h-full min-w-0">
                      <div
                        class="absolute left-1/2 -translate-x-1/2 bottom-[calc(var(--prompt-height,8rem)+32px)] z-[60] pointer-events-none transition-all duration-200 ease-out"
                        classList={{
                          "opacity-100 translate-y-0 scale-100": autoScroll.userScrolled(),
                          "opacity-0 translate-y-2 scale-95 pointer-events-none": !autoScroll.userScrolled(),
                        }}
                      >
                        <button
                          class="pointer-events-auto size-8 flex items-center justify-center rounded-full bg-background-base border border-border-base shadow-sm text-text-base hover:bg-background-stronger transition-colors"
                          onClick={resumeScroll}
                        >
                          <Icon name="arrow-down-to-line" />
                        </button>
                      </div>
                      <div
                        ref={setScrollRef}
                        onWheel={(e) => {
                          const root = e.currentTarget
                          const target = e.target instanceof Element ? e.target : undefined
                          const nested = target?.closest("[data-scrollable]")
                          if (!nested || nested === root) {
                            markScrollGesture(root)
                            return
                          }

                          if (!(nested instanceof HTMLElement)) {
                            markScrollGesture(root)
                            return
                          }

                          const max = nested.scrollHeight - nested.clientHeight
                          if (max <= 1) {
                            markScrollGesture(root)
                            return
                          }

                          const delta =
                            e.deltaMode === 1
                              ? e.deltaY * 40
                              : e.deltaMode === 2
                                ? e.deltaY * root.clientHeight
                                : e.deltaY
                          if (!delta) return

                          if (delta < 0) {
                            if (nested.scrollTop + delta <= 0) markScrollGesture(root)
                            return
                          }

                          const remaining = max - nested.scrollTop
                          if (delta > remaining) markScrollGesture(root)
                        }}
                        onTouchStart={(e) => {
                          touchGesture = e.touches[0]?.clientY
                        }}
                        onTouchMove={(e) => {
                          const next = e.touches[0]?.clientY
                          const prev = touchGesture
                          touchGesture = next
                          if (next === undefined || prev === undefined) return

                          const delta = prev - next
                          if (!delta) return

                          const root = e.currentTarget
                          const target = e.target instanceof Element ? e.target : undefined
                          const nested = target?.closest("[data-scrollable]")
                          if (!nested || nested === root) {
                            markScrollGesture(root)
                            return
                          }

                          if (!(nested instanceof HTMLElement)) {
                            markScrollGesture(root)
                            return
                          }

                          const max = nested.scrollHeight - nested.clientHeight
                          if (max <= 1) {
                            markScrollGesture(root)
                            return
                          }

                          if (delta < 0) {
                            if (nested.scrollTop + delta <= 0) markScrollGesture(root)
                            return
                          }

                          const remaining = max - nested.scrollTop
                          if (delta > remaining) markScrollGesture(root)
                        }}
                        onTouchEnd={() => {
                          touchGesture = undefined
                        }}
                        onTouchCancel={() => {
                          touchGesture = undefined
                        }}
                        onPointerDown={(e) => {
                          if (e.target !== e.currentTarget) return
                          markScrollGesture(e.currentTarget)
                        }}
                        onScroll={(e) => {
                          if (!hasScrollGesture()) return
                          autoScroll.handleScroll()
                          markScrollGesture(e.currentTarget)
                          if (isDesktop()) scheduleScrollSpy(e.currentTarget)
                        }}
                        onClick={autoScroll.handleInteraction}
                        class="relative min-w-0 w-full h-full overflow-y-auto session-scroller"
                        style={{ "--session-title-height": info()?.title || info()?.parentID ? "40px" : "0px" }}
                      >
                        <Show when={info()?.title || info()?.parentID}>
                          <div
                            classList={{
                              "sticky top-0 z-30 bg-background-stronger": true,
                              "w-full": true,
                              "px-4 md:px-6": true,
                              "md:max-w-200 md:mx-auto 3xl:max-w-[1200px] 4xl:max-w-[1600px] 5xl:max-w-[1900px]":
                                centered(),
                            }}
                          >
                            <div class="h-10 flex items-center gap-1">
                              <Show when={info()?.parentID}>
                                <IconButton
                                  tabIndex={-1}
                                  icon="arrow-left"
                                  variant="ghost"
                                  onClick={() => {
                                    navigate(`/${params.dir}/session/${info()?.parentID}`)
                                  }}
                                  aria-label={language.t("common.goBack")}
                                />
                              </Show>
                              <Show when={info()?.title}>
                                <h1 class="text-16-medium text-text-strong truncate">{info()?.title}</h1>
                              </Show>
                            </div>
                          </div>
                        </Show>

                        {iife(() => {
                          const sessionData = sessionSyncData()
                          const sessionDir = actualSessionDir()
                          const platform = usePlatform()
                          const auth = useAuth()
                          const sessionClient = createMemo(() =>
                            sessionDir === sdk.directory
                              ? sdk.client
                              : createOpencodeClient({
                                  baseUrl: sdk.url,
                                  fetch: platform.fetch,
                                  directory: sessionDir,
                                  throwOnError: true,
                                  onClient: (c) => addAuthInterceptor(c, () => auth.token),
                                }),
                          )
                          const respond = (input: {
                            sessionID: string
                            permissionID: string
                            response: "once" | "always" | "reject"
                          }) => {
                            return sessionClient().permission.respond(input)
                          }
                          const replyToQuestion = (input: { requestID: string; answers: QuestionAnswer[] }) =>
                            sessionClient().question.reply(input)
                          const rejectQuestion = (input: { requestID: string }) =>
                            sessionClient().question.reject(input)
                          const replyToSelect = (input: {
                            requestID: string
                            value: string
                            source?: "option" | "custom"
                          }) =>
                            sessionClient().select.reply({
                              requestID: input.requestID,
                              selectReply: {
                                value: input.value,
                                source: input.source,
                              },
                            })
                          const rejectSelect = (input: { requestID: string }) => sessionClient().select.reject(input)
                          const navigateToSession = (sessionID: string) => {
                            navigate(`/${params.dir}/session/${sessionID}`)
                          }
                          const fetchFn = platform.fetch ?? fetch
                          const getHeaders = () => {
                            const h: Record<string, string> = {}
                            const token = auth.token
                            if (token) h["Authorization"] = `Bearer ${token}`
                            return h
                          }
                          const onTaskRetry = async (taskId: string) => {
                            try {
                              const url = `${sdk.url}/task/${taskId}/retry?directory=${encodeURIComponent(sessionDir)}`
                              const res = await fetchFn(url, { method: "POST", headers: getHeaders() })
                              if (!res.ok) throw new Error(await res.text())
                            } catch (e) {
                              showToast({
                                variant: "error",
                                title: language.t("common.requestFailed"),
                                description: e instanceof Error ? e.message : String(e),
                              })
                              throw e
                            }
                          }
                          const onTaskCancel = async (taskId: string) => {
                            try {
                              const url = `${sdk.url}/task/${taskId}/cancel?directory=${encodeURIComponent(sessionDir)}`
                              const res = await fetchFn(url, { method: "POST", headers: getHeaders() })
                              if (!res.ok) throw new Error(await res.text())
                            } catch (e) {
                              showToast({
                                variant: "error",
                                title: language.t("common.requestFailed"),
                                description: e instanceof Error ? e.message : String(e),
                              })
                              throw e
                            }
                          }
                          return (
                            <DataProvider
                              data={sessionData}
                              directory={sessionDir}
                              onPermissionRespond={respond}
                              onQuestionReply={replyToQuestion}
                              onQuestionReject={rejectQuestion}
                              onSelectReply={replyToSelect}
                              onSelectReject={rejectSelect}
                              onNavigateToSession={navigateToSession}
                              onTaskRetry={onTaskRetry}
                              onTaskCancel={onTaskCancel}
                            >
                              <div
                                ref={autoScroll.contentRef}
                                role="log"
                                class="flex flex-col gap-12 items-start justify-start pb-[calc(var(--prompt-height,8rem)+64px)] md:pb-[calc(var(--prompt-height,10rem)+64px)] transition-[margin]"
                                classList={{
                                  "w-full": true,
                                  "md:max-w-200 md:mx-auto 3xl:max-w-[1200px] 4xl:max-w-[1600px] 5xl:max-w-[1900px]":
                                    centered(),
                                  "mt-0.5": centered(),
                                  "mt-0": !centered(),
                                }}
                              >
                                <Show when={store.turnStart > 0}>
                                  <div class="w-full flex justify-center">
                                    <Button
                                      variant="ghost"
                                      size="large"
                                      class="text-12-medium opacity-50"
                                      onClick={() => setStore("turnStart", 0)}
                                    >
                                      {language.t("session.messages.renderEarlier")}
                                    </Button>
                                  </div>
                                </Show>
                                <Show when={historyMore()}>
                                  <div class="w-full flex justify-center">
                                    <Button
                                      variant="ghost"
                                      size="large"
                                      class="text-12-medium opacity-50"
                                      disabled={historyLoading()}
                                      onClick={() => {
                                        const id = params.id
                                        if (!id) return
                                        setStore("turnStart", 0)
                                        sync.session.history.loadMore(id)
                                      }}
                                    >
                                      {historyLoading()
                                        ? language.t("session.messages.loadingEarlier")
                                        : language.t("session.messages.loadEarlier")}
                                    </Button>
                                  </div>
                                </Show>
                                <For each={renderedUserMessages()}>
                                  {(message) => {
                                    if (import.meta.env.DEV) {
                                      onMount(() => {
                                        const id = params.id
                                        if (!id) return
                                        navMark({ dir: params.dir, to: id, name: "session:first-turn-mounted" })
                                      })
                                    }

                                    return (
                                      <div
                                        id={anchor(message.id)}
                                        data-message-id={message.id}
                                        classList={{
                                          "min-w-0 w-full max-w-full": true,
                                          "md:max-w-200 3xl:max-w-[1200px] 4xl:max-w-[1600px] 5xl:max-w-[1900px]":
                                            centered(),
                                        }}
                                      >
                                        <SessionTurn
                                          sessionID={params.id!}
                                          messageID={message.id}
                                          lastUserMessageID={lastUserMessage()?.id}
                                          stepsExpanded={store.expanded[message.id] ?? false}
                                          onStepsExpandedToggle={() =>
                                            setStore("expanded", message.id, (open: boolean | undefined) => !open)
                                          }
                                          classes={{
                                            root: "min-w-0 w-full relative",
                                            content: "flex flex-col justify-between !overflow-visible",
                                            container: "w-full px-4 md:px-6",
                                          }}
                                        />
                                      </div>
                                    )
                                  }}
                                </For>
                              </div>
                            </DataProvider>
                          )
                        })}
                      </div>
                    </div>
                  </Show>
                </Show>
              </Match>
              <Match when={true}>
                <NewSessionView
                  onCreate={() => void createSessionFromCurrentProject()}
                  creating={ui.creating.status === "running"}
                />
              </Match>
            </Switch>
          </div>

          {/* Prompt input */}
          <Show when={params.id}>
            <div
              ref={(el) => (promptDock = el)}
              class="absolute inset-x-0 bottom-0 pt-12 pb-4 flex flex-col justify-center items-center z-50 px-4 md:px-0 bg-gradient-to-t from-background-stronger via-background-stronger to-transparent pointer-events-none"
            >
              <div
                classList={{
                  "w-full px-4 pointer-events-auto": true,
                  "md:max-w-200 3xl:max-w-[1200px] 4xl:max-w-[1600px] 5xl:max-w-[1900px]": centered(),
                }}
              >
                <Show when={request()} keyed>
                  {(perm) => (
                    <div data-component="tool-part-wrapper" data-permission="true" class="mb-3">
                      <BasicTool
                        icon="checklist"
                        locked
                        defaultOpen
                        trigger={{
                          title: language.t("notification.permission.title"),
                          subtitle:
                            perm.permission === "doom_loop"
                              ? language.t("settings.permissions.tool.doom_loop.title")
                              : perm.permission,
                        }}
                      >
                        <Show when={perm.patterns.length > 0}>
                          <div class="flex flex-col gap-1 py-2 px-3 max-h-40 overflow-y-auto no-scrollbar">
                            <For each={perm.patterns}>
                              {(pattern) => <code class="text-12-regular text-text-base break-all">{pattern}</code>}
                            </For>
                          </div>
                        </Show>
                        <Show when={perm.permission === "doom_loop"}>
                          <div class="text-12-regular text-text-weak pb-2 px-3">
                            {language.t("settings.permissions.tool.doom_loop.description")}
                          </div>
                        </Show>
                      </BasicTool>
                      <div data-component="permission-prompt">
                        <div data-slot="permission-actions">
                          <Button
                            variant="ghost"
                            size="small"
                            onClick={() => decide("reject")}
                            disabled={ui.responding}
                          >
                            {language.t("ui.permission.deny")}
                          </Button>
                          <Button
                            variant="secondary"
                            size="small"
                            onClick={() => decide("always")}
                            disabled={ui.responding}
                          >
                            {language.t("ui.permission.allowAlways")}
                          </Button>
                          <Button
                            variant="primary"
                            size="small"
                            onClick={() => decide("once")}
                            disabled={ui.responding}
                          >
                            {language.t("ui.permission.allowOnce")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </Show>

                <Show
                  when={prompt.ready()}
                  fallback={
                    <div class="w-full min-h-32 md:min-h-40 rounded-md border border-border-weak-base bg-background-base/50 px-4 py-3 text-text-weak whitespace-pre-wrap pointer-events-none">
                      {handoff.prompt || language.t("prompt.loading")}
                    </div>
                  }
                >
                  <PromptInput
                    ref={(el) => {
                      inputRef = el
                    }}
                    onSubmit={resumeScroll}
                    resolvedSessionDir={actualSessionDir()}
                  />
                </Show>
              </div>
            </div>
          </Show>

          <Show when={isDesktop() && layout.fileTree.opened()}>
            <ResizeHandle
              direction="horizontal"
              size={layout.session.width()}
              min={450}
              max={window.innerWidth * 0.45}
              onResize={layout.session.resize}
            />
          </Show>
        </div>

        {/* Desktop side panel - hidden on mobile */}
        <Show when={isDesktop() && layout.fileTree.opened()}>
          <aside
            id="review-panel"
            aria-label={language.t("session.panel.reviewAndFiles")}
            class="relative flex-1 min-w-0 h-full border-l border-border-weak-base flex"
          >
            <div class="flex-1 min-w-0 h-full">
              <Show
                when={fileTreeTab() === "git"}
                fallback={
                  <Show
                    when={fileTreeTab() === "history"}
                    fallback={
                  <DragDropProvider
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    collisionDetector={closestCenter}
                  >
                    <DragDropSensors />
                    <ConstrainDragYAxis />
                    <Tabs value={activeTab()} onChange={openTab}>
                      <div class="sticky top-0 shrink-0 flex">
                        <Tabs.List
                          ref={(el: HTMLDivElement) => {
                            let scrollTimeout: number | undefined
                            let prevScrollWidth = el.scrollWidth
                            let prevContextOpen = contextOpen()

                            const handler = () => {
                              if (scrollTimeout !== undefined) clearTimeout(scrollTimeout)
                              scrollTimeout = window.setTimeout(() => {
                                const scrollWidth = el.scrollWidth
                                const clientWidth = el.clientWidth
                                const currentContextOpen = contextOpen()

                                // Only scroll when a tab is added (width increased), not on removal
                                if (scrollWidth > prevScrollWidth) {
                                  if (!prevContextOpen && currentContextOpen) {
                                    // Context tab was opened, scroll to first
                                    el.scrollTo({
                                      left: 0,
                                      behavior: "smooth",
                                    })
                                  } else if (scrollWidth > clientWidth) {
                                    // File tab was added, scroll to rightmost
                                    el.scrollTo({
                                      left: scrollWidth - clientWidth,
                                      behavior: "smooth",
                                    })
                                  }
                                }
                                // When width decreases (tab removed), don't scroll - let browser handle it naturally

                                prevScrollWidth = scrollWidth
                                prevContextOpen = currentContextOpen
                              }, 0)
                            }

                            const wheelHandler = (e: WheelEvent) => {
                              // Enable horizontal scrolling with mouse wheel
                              if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                                el.scrollLeft += e.deltaY > 0 ? 50 : -50
                                e.preventDefault()
                              }
                            }

                            el.addEventListener("wheel", wheelHandler, { passive: false })

                            const observer = new MutationObserver(handler)
                            observer.observe(el, { childList: true })

                            onCleanup(() => {
                              el.removeEventListener("wheel", wheelHandler)
                              observer.disconnect()
                              if (scrollTimeout !== undefined) clearTimeout(scrollTimeout)
                            })
                          }}
                        >
                          <Show when={contextOpen()}>
                            <Tabs.Trigger
                              value="context"
                              closeButton={
                                <Tooltip value={language.t("common.closeTab")} placement="bottom">
                                  <IconButton
                                    icon="close-small"
                                    variant="ghost"
                                    class="h-5 w-5"
                                    onClick={() => tabs().close("context")}
                                    aria-label={language.t("common.closeTab")}
                                  />
                                </Tooltip>
                              }
                              hideCloseButton
                              onMiddleClick={() => tabs().close("context")}
                            >
                              <div class="flex items-center gap-2">
                                <SessionContextUsage variant="indicator" messages={messages} />
                                <div>{language.t("session.tab.context")}</div>
                              </div>
                            </Tabs.Trigger>
                          </Show>
                          <SortableProvider ids={openedTabs()}>
                            <For each={openedTabs()}>
                              {(tab) => <SortableTab tab={tab} onTabClose={tabs().close} />}
                            </For>
                          </SortableProvider>
                          <Show when={auth.canFeature("files")}>
                            <StickyAddButton>
                              <TooltipKeybind
                                title={language.t("command.file.open")}
                                keybind={command.keybind("file.open")}
                                class="flex items-center"
                              >
                                <IconButton
                                  icon="plus-small"
                                  variant="ghost"
                                  iconSize="large"
                                  onClick={() =>
                                    dialog.show(() => (
                                      <DialogSelectFile mode="files" onOpenFile={() => showAllFiles()} />
                                    ))
                                  }
                                  aria-label={language.t("command.file.open")}
                                />
                              </TooltipKeybind>
                            </StickyAddButton>
                          </Show>
                        </Tabs.List>
                      </div>

                      <Tabs.Content value="empty" class="flex flex-col h-full overflow-hidden contain-strict">
                        <Show when={activeTab() === "empty"}>
                          <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
                            <div class="h-full px-6 pb-42 flex flex-col items-center justify-center text-center gap-6">
                              <Mark class="w-14 opacity-10" />
                              <div class="text-14-regular text-text-weak max-w-56">
                                {language.t("session.files.selectToOpen")}
                              </div>
                            </div>
                          </div>
                        </Show>
                      </Tabs.Content>

                      <Show when={contextOpen()}>
                        <Tabs.Content value="context" class="flex flex-col h-full overflow-hidden contain-strict">
                          <Show when={activeTab() === "context"}>
                            <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
                              <SessionContextTab
                                messages={messages}
                                parts={parts}
                                visibleUserMessages={visibleUserMessages}
                                view={view}
                                info={info}
                              />
                            </div>
                          </Show>
                        </Tabs.Content>
                      </Show>

                      <For each={openedTabs()}>
                        {(tab) => {
                          let scroll: HTMLDivElement | undefined
                          let scrollFrame: number | undefined
                          let pending: { x: number; y: number } | undefined
                          let codeScroll: HTMLElement[] = []

                          const path = createMemo(() => file.pathFromTab(tab))
                          const state = createMemo(() => {
                            const p = path()
                            if (!p) return
                            return file.get(p)
                          })
                          const contents = createMemo(() => state()?.content?.content ?? "")
                          const cacheKey = createMemo(() => checksum(contents()))
                          const isImage = createMemo(() => {
                            const c = state()?.content
                            return (
                              c?.encoding === "base64" &&
                              c?.mimeType?.startsWith("image/") &&
                              c?.mimeType !== "image/svg+xml"
                            )
                          })
                          const isSvg = createMemo(() => {
                            const c = state()?.content
                            return c?.mimeType === "image/svg+xml"
                          })
                          const isBinary = createMemo(() => state()?.content?.type === "binary")
                          const svgContent = createMemo(() => {
                            if (!isSvg()) return
                            const c = state()?.content
                            if (!c) return
                            if (c.encoding !== "base64") return c.content
                            return decode64(c.content)
                          })

                          const svgDecodeFailed = createMemo(() => {
                            if (!isSvg()) return false
                            const c = state()?.content
                            if (!c) return false
                            if (c.encoding !== "base64") return false
                            return svgContent() === undefined
                          })

                          const svgToast = { shown: false }
                          createEffect(() => {
                            if (!svgDecodeFailed()) return
                            if (svgToast.shown) return
                            svgToast.shown = true
                            showToast({
                              variant: "error",
                              title: language.t("toast.file.loadFailed.title"),
                              description: "Invalid base64 content.",
                            })
                          })
                          const svgPreviewUrl = createMemo(() => {
                            if (!isSvg()) return
                            const c = state()?.content
                            if (!c) return
                            if (c.encoding === "base64") return `data:image/svg+xml;base64,${c.content}`
                            return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(c.content)}`
                          })
                          const imageDataUrl = createMemo(() => {
                            if (!isImage()) return
                            const c = state()?.content
                            return `data:${c?.mimeType};base64,${c?.content}`
                          })
                          const selectedLines = createMemo(() => {
                            const p = path()
                            if (!p) return null
                            if (file.ready()) return file.selectedLines(p) ?? null
                            return handoff.files[p] ?? null
                          })

                          let wrap: HTMLDivElement | undefined

                          const fileComments = createMemo(() => {
                            const p = path()
                            if (!p) return []
                            return comments.list(p)
                          })

                          const commentedLines = createMemo(() => fileComments().map((comment) => comment.selection))

                          const [note, setNote] = createStore({
                            openedComment: null as string | null,
                            commenting: null as SelectedLineRange | null,
                            draft: "",
                            positions: {} as Record<string, number>,
                            draftTop: undefined as number | undefined,
                          })

                          const openedComment = () => note.openedComment
                          const setOpenedComment = (
                            value:
                              | typeof note.openedComment
                              | ((value: typeof note.openedComment) => typeof note.openedComment),
                          ) => setNote("openedComment", value)

                          const commenting = () => note.commenting
                          const setCommenting = (
                            value: typeof note.commenting | ((value: typeof note.commenting) => typeof note.commenting),
                          ) => setNote("commenting", value)

                          const draft = () => note.draft
                          const setDraft = (
                            value: typeof note.draft | ((value: typeof note.draft) => typeof note.draft),
                          ) => setNote("draft", value)

                          const positions = () => note.positions
                          const setPositions = (
                            value: typeof note.positions | ((value: typeof note.positions) => typeof note.positions),
                          ) => setNote("positions", value)

                          const draftTop = () => note.draftTop
                          const setDraftTop = (
                            value: typeof note.draftTop | ((value: typeof note.draftTop) => typeof note.draftTop),
                          ) => setNote("draftTop", value)

                          const commentLabel = (range: SelectedLineRange) => {
                            const start = Math.min(range.start, range.end)
                            const end = Math.max(range.start, range.end)
                            if (start === end) return `line ${start}`
                            return `lines ${start}-${end}`
                          }

                          const getRoot = () => {
                            const el = wrap
                            if (!el) return

                            const host = el.querySelector("diffs-container")
                            if (!(host instanceof HTMLElement)) return

                            const root = host.shadowRoot
                            if (!root) return

                            return root
                          }

                          const findSide = (element: HTMLElement): "additions" | "deletions" | undefined => {
                            const typed = element.closest("[data-line-type]")
                            if (typed instanceof HTMLElement) {
                              const type = typed.dataset.lineType
                              if (type === "change-deletion") return "deletions"
                              if (type === "change-addition" || type === "change-additions") return "additions"
                            }

                            const code = element.closest("[data-code]")
                            if (!(code instanceof HTMLElement)) return
                            return code.hasAttribute("data-deletions") ? "deletions" : "additions"
                          }

                          const findMarker = (root: ShadowRoot, range: SelectedLineRange) => {
                            const marker = (line: number, side?: "additions" | "deletions") => {
                              const nodes = Array.from(
                                root.querySelectorAll(`[data-line="${line}"], [data-alt-line="${line}"]`),
                              ).filter((node): node is HTMLElement => node instanceof HTMLElement)
                              if (nodes.length === 0) return
                              if (!side) return nodes[0]
                              return nodes.find((node) => findSide(node) === side) ?? nodes[0]
                            }

                            const a = marker(range.start, range.side)
                            const b = marker(range.end, range.endSide ?? range.side)
                            if (!a) return b
                            if (!b) return a
                            return a.getBoundingClientRect().top > b.getBoundingClientRect().top ? a : b
                          }

                          const markerTop = (wrapper: HTMLElement, marker: HTMLElement) => {
                            const wrapperRect = wrapper.getBoundingClientRect()
                            const rect = marker.getBoundingClientRect()
                            return rect.top - wrapperRect.top + Math.max(0, (rect.height - 20) / 2)
                          }

                          const updateComments = () => {
                            const el = wrap
                            const root = getRoot()
                            if (!el || !root) {
                              setPositions({})
                              setDraftTop(undefined)
                              return
                            }

                            const next: Record<string, number> = {}
                            for (const comment of fileComments()) {
                              const marker = findMarker(root, comment.selection)
                              if (!marker) continue
                              next[comment.id] = markerTop(el, marker)
                            }

                            setPositions(next)

                            const range = commenting()
                            if (!range) {
                              setDraftTop(undefined)
                              return
                            }

                            const marker = findMarker(root, range)
                            if (!marker) {
                              setDraftTop(undefined)
                              return
                            }

                            setDraftTop(markerTop(el, marker))
                          }

                          const scheduleComments = () => {
                            requestAnimationFrame(updateComments)
                          }

                          createEffect(() => {
                            fileComments()
                            scheduleComments()
                          })

                          createEffect(() => {
                            const range = commenting()
                            scheduleComments()
                            if (!range) return
                            setDraft("")
                          })

                          createEffect(() => {
                            const focus = comments.focus()
                            const p = path()
                            if (!focus || !p) return
                            if (focus.file !== p) return
                            if (activeTab() !== tab) return

                            const target = fileComments().find((comment) => comment.id === focus.id)
                            if (!target) return

                            setOpenedComment(target.id)
                            setCommenting(null)
                            file.setSelectedLines(p, target.selection)
                            requestAnimationFrame(() => comments.clearFocus())
                          })

                          const renderCode = (source: string, wrapperClass: string) => (
                            <div
                              ref={(el) => {
                                wrap = el
                                scheduleComments()
                              }}
                              class={`relative overflow-hidden ${wrapperClass}`}
                            >
                              <Dynamic
                                component={codeComponent}
                                file={{
                                  name: path() ?? "",
                                  contents: source,
                                  cacheKey: cacheKey(),
                                }}
                                enableLineSelection={auth.canFeature("files")}
                                selectedLines={selectedLines()}
                                commentedLines={commentedLines()}
                                onRendered={() => {
                                  requestAnimationFrame(restoreScroll)
                                  requestAnimationFrame(scheduleComments)
                                }}
                                onLineSelected={(range: SelectedLineRange | null) => {
                                  const p = path()
                                  if (!p) return
                                  file.setSelectedLines(p, range)
                                  if (!range) setCommenting(null)
                                }}
                                onLineSelectionEnd={(range: SelectedLineRange | null) => {
                                  if (!range) {
                                    setCommenting(null)
                                    return
                                  }

                                  setOpenedComment(null)
                                  setCommenting(range)
                                }}
                                overflow="scroll"
                                class="select-text"
                              />
                              <For each={fileComments()}>
                                {(comment) => (
                                  <LineCommentView
                                    id={comment.id}
                                    top={positions()[comment.id]}
                                    open={openedComment() === comment.id}
                                    comment={comment.comment}
                                    selection={commentLabel(comment.selection)}
                                    onMouseEnter={() => {
                                      const p = path()
                                      if (!p) return
                                      file.setSelectedLines(p, comment.selection)
                                    }}
                                    onClick={() => {
                                      const p = path()
                                      if (!p) return
                                      setCommenting(null)
                                      setOpenedComment((current) => (current === comment.id ? null : comment.id))
                                      file.setSelectedLines(p, comment.selection)
                                    }}
                                  />
                                )}
                              </For>
                              <Show when={commenting()}>
                                {(range) => (
                                  <Show when={draftTop() !== undefined}>
                                    <LineCommentEditor
                                      top={draftTop()}
                                      value={draft()}
                                      selection={commentLabel(range())}
                                      onInput={(value) => setDraft(value)}
                                      onCancel={() => setCommenting(null)}
                                      onSubmit={(value) => {
                                        const p = path()
                                        if (!p) return
                                        addCommentToContext({
                                          file: p,
                                          selection: range(),
                                          comment: value,
                                          origin: "file",
                                        })
                                        setCommenting(null)
                                      }}
                                      onPopoverFocusOut={(e: FocusEvent) => {
                                        const current = e.currentTarget as HTMLDivElement
                                        const target = e.relatedTarget
                                        if (target instanceof Node && current.contains(target)) return

                                        setTimeout(() => {
                                          if (!document.activeElement || !current.contains(document.activeElement)) {
                                            setCommenting(null)
                                          }
                                        }, 0)
                                      }}
                                    />
                                  </Show>
                                )}
                              </Show>
                            </div>
                          )

                          const getCodeScroll = () => {
                            const el = scroll
                            if (!el) return []

                            const host = el.querySelector("diffs-container")
                            if (!(host instanceof HTMLElement)) return []

                            const root = host.shadowRoot
                            if (!root) return []

                            return Array.from(root.querySelectorAll("[data-code]")).filter(
                              (node): node is HTMLElement => node instanceof HTMLElement && node.clientWidth > 0,
                            )
                          }

                          const queueScrollUpdate = (next: { x: number; y: number }) => {
                            pending = next
                            if (scrollFrame !== undefined) return

                            scrollFrame = requestAnimationFrame(() => {
                              scrollFrame = undefined

                              const next = pending
                              pending = undefined
                              if (!next) return

                              view().setScroll(tab, next)
                            })
                          }

                          const handleCodeScroll = (event: Event) => {
                            const el = scroll
                            if (!el) return

                            const target = event.currentTarget
                            if (!(target instanceof HTMLElement)) return

                            queueScrollUpdate({
                              x: target.scrollLeft,
                              y: el.scrollTop,
                            })
                          }

                          const syncCodeScroll = () => {
                            const next = getCodeScroll()
                            if (next.length === codeScroll.length && next.every((el, i) => el === codeScroll[i])) return

                            for (const item of codeScroll) {
                              item.removeEventListener("scroll", handleCodeScroll)
                            }

                            codeScroll = next

                            for (const item of codeScroll) {
                              item.addEventListener("scroll", handleCodeScroll)
                            }
                          }

                          const restoreScroll = () => {
                            const el = scroll
                            if (!el) return

                            const s = view()?.scroll(tab)
                            if (!s) return

                            syncCodeScroll()

                            if (codeScroll.length > 0) {
                              for (const item of codeScroll) {
                                if (item.scrollLeft !== s.x) item.scrollLeft = s.x
                              }
                            }

                            if (el.scrollTop !== s.y) el.scrollTop = s.y

                            if (codeScroll.length > 0) return

                            if (el.scrollLeft !== s.x) el.scrollLeft = s.x
                          }

                          const handleScroll = (event: Event & { currentTarget: HTMLDivElement }) => {
                            if (codeScroll.length === 0) syncCodeScroll()

                            queueScrollUpdate({
                              x: codeScroll[0]?.scrollLeft ?? event.currentTarget.scrollLeft,
                              y: event.currentTarget.scrollTop,
                            })
                          }

                          createEffect(
                            on(
                              () => state()?.loaded,
                              (loaded) => {
                                if (!loaded) return
                                requestAnimationFrame(restoreScroll)
                              },
                              { defer: true },
                            ),
                          )

                          createEffect(
                            on(
                              () => file.ready(),
                              (ready) => {
                                if (!ready) return
                                requestAnimationFrame(restoreScroll)
                              },
                              { defer: true },
                            ),
                          )

                          createEffect(
                            on(
                              () => tabs().active() === tab,
                              (active) => {
                                if (!active) return
                                if (!state()?.loaded) return
                                requestAnimationFrame(restoreScroll)
                              },
                            ),
                          )

                          onCleanup(() => {
                            for (const item of codeScroll) {
                              item.removeEventListener("scroll", handleCodeScroll)
                            }

                            if (scrollFrame === undefined) return
                            cancelAnimationFrame(scrollFrame)
                          })

                          return (
                            <Tabs.Content
                              value={tab}
                              class="mt-3 relative"
                              ref={(el: HTMLDivElement) => {
                                scroll = el
                                restoreScroll()
                              }}
                              onScroll={handleScroll}
                            >
                              <Switch>
                                <Match when={state()?.loaded && isImage()}>
                                  <div class="px-6 py-4 pb-40">
                                    <img
                                      src={imageDataUrl()}
                                      alt={path()}
                                      class="max-w-full"
                                      onLoad={() => requestAnimationFrame(restoreScroll)}
                                    />
                                  </div>
                                </Match>
                                <Match when={state()?.loaded && isSvg()}>
                                  <div class="flex flex-col gap-4 px-6 py-4">
                                    {renderCode(svgContent() ?? "", "")}
                                    <Show when={svgPreviewUrl()}>
                                      <div class="flex justify-center pb-40">
                                        <img src={svgPreviewUrl()} alt={path()} class="max-w-full max-h-96" />
                                      </div>
                                    </Show>
                                  </div>
                                </Match>
                                <Match when={state()?.loaded && isBinary()}>
                                  <div class="h-full px-6 pb-42 flex flex-col items-center justify-center text-center gap-6">
                                    <Mark class="w-14 opacity-10" />
                                    <div class="flex flex-col gap-2 max-w-md">
                                      <div class="text-14-semibold text-text-strong truncate">
                                        {path()?.split("/").pop()}
                                      </div>
                                      <div class="text-14-regular text-text-weak">
                                        {language.t("session.files.binaryContent")}
                                      </div>
                                    </div>
                                  </div>
                                </Match>
                                <Match when={state()?.loaded}>{renderCode(contents(), "pb-40")}</Match>
                                <Match when={state()?.loading}>
                                  <div class="px-6 py-4 text-text-weak">{language.t("common.loading")}...</div>
                                </Match>
                                <Match when={state()?.error}>
                                  {(err) => <div class="px-6 py-4 text-text-weak">{err()}</div>}
                                </Match>
                              </Switch>
                            </Tabs.Content>
                          )
                        }}
                      </For>
                    </Tabs>
                    <DragOverlay>
                      <Show when={store.activeDraggable}>
                        {(tab) => {
                          const path = createMemo(() => file.pathFromTab(tab()))
                          return (
                            <div class="relative px-6 h-12 flex items-center bg-background-stronger border-x border-border-weak-base border-b border-b-transparent">
                              <Show when={path()}>{(p) => <FileVisual active path={p()} />}</Show>
                            </div>
                          )
                        }}
                      </Show>
                    </DragOverlay>
                  </DragDropProvider>
                    }
                  >
                    <SessionGitCommitDetail
                      commit={gitHistoryCommit()}
                      loading={gitHistoryCommitLoading()}
                      loadingLabel={language.t("session.history.loadingCommit")}
                      emptyLabel={language.t("session.history.selectCommit")}
                      authorLabel={language.t("session.history.author")}
                      dateLabel={language.t("session.history.date")}
                      parentsLabel={language.t("session.history.parents")}
                      filesLabel={language.t("session.history.changedFiles")}
                      noDiffLabel={language.t("session.history.noDiff")}
                      openFileLabel={language.t("session.history.openFile")}
                      diffStyle={layout.review.diffStyle()}
                      onDiffStyleChange={layout.review.setDiffStyle}
                      onViewFile={openHistoryFile}
                    />
                  </Show>
                }
              >
                {reviewPanel()}
              </Show>
            </div>

            <Show when={auth.canFeature("files") && layout.fileTree.opened()}>
              <div
                id="file-tree-panel"
                class="relative shrink-0 h-full"
                style={{ width: `${layout.fileTree.width()}px` }}
              >
                <div class="h-full border-l border-border-weak-base flex flex-col overflow-hidden group/filetree">
                  <Tabs
                    variant="pill"
                    value={fileTreeTab()}
                    onChange={setFileTreeTabValue}
                    class="h-full"
                    data-scope="filetree"
                  >
                    <div class="flex items-center gap-1 px-2 pt-2">
                      <Tabs.List class="min-w-0 flex-1">
                        <Tabs.Trigger value="git" class="flex-1" classes={{ button: "w-full" }}>
                          {gitStatus().length ? `${gitStatus().length} ` : ""}
                          {language.t("session.files.git")}
                        </Tabs.Trigger>
                        <Tabs.Trigger value="history" class="flex-1" classes={{ button: "w-full" }}>
                          {language.t("session.files.history")}
                        </Tabs.Trigger>
                        <Tabs.Trigger value="all" class="flex-1" classes={{ button: "w-full" }}>
                          {language.t("session.files.all")}
                        </Tabs.Trigger>
                      </Tabs.List>
                      <Tooltip placement="bottom" value={language.t("session.files.refresh")}>
                        <Button
                          type="button"
                          variant="ghost"
                          class="h-7 shrink-0 px-2 text-11-medium"
                          disabled={fileTreeRefreshing()}
                          onClick={() => void refreshFileTree()}
                          aria-label={language.t("session.files.refresh")}
                        >
                          {fileTreeRefreshing() ? language.t("session.files.refreshing") : language.t("session.files.refresh")}
                        </Button>
                      </Tooltip>
                    </div>
                    <Tabs.Content value="git" class="bg-background-base px-3 py-0">
                      <Show
                        when={gitStatus().length > 0}
                        fallback={
                          <div class="mt-8 text-center text-12-regular text-text-weak">
                            {language.t("session.git.noChanges")}
                          </div>
                        }
                      >
                        <FileTree
                          path=""
                          allowed={gitStatusFiles()}
                          kinds={gitStatusKinds()}
                          draggable={false}
                          active={activeDiff()}
                          onFileClick={(node) => focusReviewDiff(node.path)}
                        />
                      </Show>
                    </Tabs.Content>
                    <Tabs.Content value="all" class="bg-background-base px-3 py-0">
                      <FileTree
                        path=""
                        modified={diffFiles()}
                        kinds={kinds()}
                        onFileClick={(node) => openTab(file.tab(node.path))}
                      />
                    </Tabs.Content>
                    <Tabs.Content value="history" class="bg-background-base px-0 py-0">
                      <SessionGitHistoryTab
                        title={language.t("session.files.history")}
                        projects={gitHistoryProjects().map((item) => ({ id: item.id, label: item.label }))}
                        currentProject={selectedHistoryProject()}
                        currentProjectLabel={historyProject()?.label}
                        currentBranch={historyCurrentBranch()}
                        trackingBranch={gitHistoryVcs().tracking}
                        currentCommit={historyCurrentCommit()}
                        workingTree={{
                          id: HISTORY_WORKING_TREE_ID,
                          label: historyCurrentBranch() || "HEAD",
                          summary: historyWorkingTreeSummary(),
                          files: gitHistoryStatus().length,
                          selected: selectedHistoryCommit() === HISTORY_WORKING_TREE_ID,
                        }}
                        commits={gitHistory().items}
                        selected={selectedHistoryCommit()}
                        loading={gitHistoryLoading()}
                        loadingMore={gitHistoryLoadingMore()}
                        hasMore={!!gitHistory().next}
                        empty={language.t("session.history.empty")}
                        loadingLabel={language.t("session.history.loading")}
                        loadMoreLabel={language.t("common.loadMore")}
                        projectLabel={language.t("session.history.project")}
                        refreshLabel={language.t("dialog.branch.refresh")}
                        currentBranchLabel={language.t("prompt.git.currentBranch")}
                        trackingBranchLabel={language.t("prompt.git.trackingRemote")}
                        currentCommitLabel={language.t("session.history.currentCommit")}
                        onRefresh={refreshGitHistory}
                        onSelect={setSelectedHistoryCommit}
                        onSelectProject={(id) => {
                          setSelectedHistoryProject(id)
                          setSelectedHistoryCommit(undefined)
                          setGitHistory({ items: [], next: undefined })
                          setGitHistoryCommit(undefined)
                          setGitHistoryStatus([])
                          setGitHistoryDiffs([])
                          setGitHistoryDiffsReady(false)
                        }}
                        onLoadMore={loadMoreGitHistory}
                      />
                    </Tabs.Content>
                  </Tabs>
                </div>
                <ResizeHandle
                  direction="horizontal"
                  edge="start"
                  size={layout.fileTree.width()}
                  min={200}
                  max={Math.max(760, window.innerWidth * 0.72)}
                  collapseThreshold={160}
                  onResize={layout.fileTree.resize}
                  onCollapse={layout.fileTree.close}
                />
              </div>
            </Show>
          </aside>
        </Show>
      </div>

      <Show when={isDesktop() && view().terminal.opened()}>
        <div
          id="terminal-panel"
          role="region"
          aria-label={language.t("terminal.title")}
          class="relative w-full flex flex-col shrink-0 border-t border-border-weak-base"
          style={{ height: `${layout.terminal.height()}px` }}
        >
          <ResizeHandle
            direction="vertical"
            size={layout.terminal.height()}
            min={100}
            max={window.innerHeight * 0.6}
            collapseThreshold={50}
            onResize={layout.terminal.resize}
            onCollapse={view().terminal.close}
          />
          <Show
            when={terminal.ready()}
            fallback={
              <div class="flex flex-col h-full pointer-events-none">
                <div class="h-10 flex items-center gap-2 px-2 border-b border-border-weak-base bg-background-stronger overflow-hidden">
                  <For each={handoff.terminals}>
                    {(title) => (
                      <div class="px-2 py-1 rounded-md bg-surface-base text-14-regular text-text-weak truncate max-w-40">
                        {title}
                      </div>
                    )}
                  </For>
                  <div class="flex-1" />
                  <div class="text-text-weak pr-2">
                    {language.t("common.loading")}
                    {language.t("common.loading.ellipsis")}
                  </div>
                </div>
                <div class="flex-1 flex items-center justify-center text-text-weak">
                  {language.t("terminal.loading")}
                </div>
              </div>
            }
          >
            <DragDropProvider
              onDragStart={handleTerminalDragStart}
              onDragEnd={handleTerminalDragEnd}
              onDragOver={handleTerminalDragOver}
              collisionDetector={closestCenter}
            >
              <DragDropSensors />
              <ConstrainDragYAxis />
              <div class="flex flex-col h-full">
                <Tabs
                  variant="alt"
                  value={terminal.active()}
                  onChange={(id) => {
                    // Only switch tabs if not in the middle of starting edit mode
                    terminal.open(id)
                  }}
                  class="!h-auto !flex-none"
                >
                  <Tabs.List class="h-10">
                    <SortableProvider ids={terminal.all().map((t: LocalPTY) => t.id)}>
                      <For each={terminal.all()}>
                        {(pty) => (
                          <SortableTerminalTab
                            terminal={pty}
                            state={terminal}
                            onClose={() => {
                              view().terminal.close()
                              setUi("autoCreated", false)
                            }}
                          />
                        )}
                      </For>
                    </SortableProvider>
                    <div class="h-full flex items-center justify-center">
                      <TooltipKeybind
                        title={language.t("command.terminal.new")}
                        keybind={command.keybind("terminal.new")}
                        class="flex items-center"
                      >
                        <IconButton
                          icon="plus-small"
                          variant="ghost"
                          iconSize="large"
                          onClick={terminal.new}
                          aria-label={language.t("command.terminal.new")}
                        />
                      </TooltipKeybind>
                    </div>
                  </Tabs.List>
                </Tabs>
                <div class="flex-1 min-h-0 relative">
                  <For each={terminal.all()}>
                    {(pty) => (
                      <div
                        id={`terminal-wrapper-${pty.id}`}
                        class="absolute inset-0"
                        style={{
                          display: terminal.active() === pty.id ? "block" : "none",
                        }}
                      >
                        <Show when={pty.id} keyed>
                          <Terminal
                            pty={pty}
                            directory={terminalDir()}
                            onCleanup={terminal.update}
                            onConnectError={() => terminal.clone(pty.id)}
                          />
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </div>
              <DragOverlay>
                <Show when={store.activeTerminalDraggable}>
                  {(draggedId) => {
                    const pty = createMemo(() => terminal.all().find((t: LocalPTY) => t.id === draggedId()))
                    return (
                      <Show when={pty()}>
                        {(t) => (
                          <div class="relative p-1 h-10 flex items-center bg-background-stronger text-14-regular">
                            {(() => {
                              const title = t().title
                              const number = t().titleNumber
                              const match = title.match(/^Terminal (\d+)$/)
                              const parsed = match ? Number(match[1]) : undefined
                              const isDefaultTitle =
                                Number.isFinite(number) && number > 0 && Number.isFinite(parsed) && parsed === number

                              if (title && !isDefaultTitle) return title
                              if (Number.isFinite(number) && number > 0)
                                return language.t("terminal.title.numbered", { number })
                              if (title) return title
                              return language.t("terminal.title")
                            })()}
                          </div>
                        )}
                      </Show>
                    )
                  }}
                </Show>
              </DragOverlay>
            </DragDropProvider>
          </Show>
        </div>
      </Show>
      <Show when={!ui.creating.open && sessionSyncData().status === "loading"}>
        <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/35 backdrop-blur-sm">
          <div class="w-full max-w-lg mx-6 rounded-xl border border-border-weak-base bg-background-base shadow-lg">
            <div class="px-6 py-6">
              <div class="flex items-center gap-3">
                <div class="flex size-10 items-center justify-center rounded-full bg-surface-base">
                  <Spinner class="size-5" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-18-medium text-text-strong">{workspaceCopy().title}</div>
                  <div class="mt-1 text-13-regular text-text-weak">{workspaceCopy().description}</div>
                </div>
              </div>
              <div class="mt-4 grid gap-2 rounded-lg bg-background-stronger p-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="text-12-medium text-text-weak">{workspaceCopy().project}</div>
                  <div class="min-w-0 text-right text-12-regular text-text-strong break-all">
                    {currentProject()?.worktree ?? decode64(params.dir) ?? ""}
                  </div>
                </div>
                <div class="flex items-start justify-between gap-3">
                  <div class="text-12-medium text-text-weak">{workspaceCopy().workspace}</div>
                  <div class="min-w-0 text-right text-12-regular text-text-strong break-all">{actualSessionDir()}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Show>
      <Show when={ui.creating.open}>
        <div class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div class="w-full max-w-xl mx-6 rounded-xl border border-border-weak-base bg-background-base shadow-lg">
            <div class="px-6 pt-6 pb-5 border-b border-border-weak-base">
              <div class="flex items-center gap-3">
                <div class="flex size-10 items-center justify-center rounded-full bg-surface-base">
                  <Spinner class="size-5" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-18-medium text-text-strong">{creatingCopy().title}</div>
                  <div class="mt-1 text-13-regular text-text-weak">{creatingCopy().description}</div>
                </div>
              </div>
              <div class="mt-4 grid gap-2 rounded-lg bg-background-stronger p-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="text-12-medium text-text-weak">{creatingCopy().project}</div>
                  <div class="min-w-0 text-right text-12-regular text-text-strong break-all">
                    {ui.creating.projectRoot}
                  </div>
                </div>
                <Show when={ui.creating.sessionDirectory}>
                  <div class="flex items-start justify-between gap-3">
                    <div class="text-12-medium text-text-weak">{creatingCopy().session}</div>
                    <div class="min-w-0 text-right text-12-regular text-text-strong break-all">
                      {ui.creating.sessionDirectory}
                    </div>
                  </div>
                </Show>
              </div>
            </div>

            <div class="px-6 py-5 flex flex-col gap-3">
              <For
                each={[
                  {
                    key: "create" as SessionCreateStep,
                    title: creatingCopy().createTitle,
                    description: creatingCopy().createDescription,
                  },
                  {
                    key: "worktree" as SessionCreateStep,
                    title: creatingCopy().worktreeTitle,
                    description: ui.creating.needsWorktree
                      ? creatingCopy().worktreeDescription
                      : creatingCopy().worktreeSkipped,
                  },
                  {
                    key: "open" as SessionCreateStep,
                    title: creatingCopy().openTitle,
                    description: creatingCopy().openDescription,
                  },
                ]}
              >
                {(item) => {
                  const state = () => sessionCreateStepState(item.key)
                  const label = () =>
                    state() === "active"
                      ? creatingCopy().active
                      : state() === "completed"
                        ? creatingCopy().completed
                        : state() === "skipped"
                          ? creatingCopy().skipped
                          : state() === "error"
                            ? creatingCopy().error
                            : creatingCopy().pending
                  return (
                    <div class="flex items-start gap-3 rounded-lg border border-border-weak-base px-4 py-3">
                      <div class="mt-0.5 flex size-5 shrink-0 items-center justify-center">
                        <Switch>
                          <Match when={state() === "active"}>
                            <Spinner class="size-4" />
                          </Match>
                          <Match when={state() === "completed"}>
                            <Icon name="check" size="small" class="text-icon-success-base" />
                          </Match>
                          <Match when={state() === "skipped"}>
                            <div class="size-2 rounded-full bg-text-weaker" />
                          </Match>
                          <Match when={state() === "error"}>
                            <div class="size-2.5 rounded-full bg-icon-danger-base" />
                          </Match>
                          <Match when={true}>
                            <div class="size-2 rounded-full bg-border-strong" />
                          </Match>
                        </Switch>
                      </div>
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center justify-between gap-3">
                          <div class="text-13-medium text-text-strong">{item.title}</div>
                          <div class="text-12-regular text-text-weak shrink-0">{label()}</div>
                        </div>
                        <div class="mt-1 text-12-regular text-text-weak">{item.description}</div>
                      </div>
                    </div>
                  )
                }}
              </For>
            </div>

            <Show when={ui.creating.status === "error"}>
              <div class="px-6 pb-6">
                <div class="rounded-lg border border-auxiliary-error/20 bg-auxiliary-error/10 px-4 py-3 text-12-regular text-auxiliary-error">
                  <div class="text-13-medium">{creatingCopy().failed}</div>
                  <div class="mt-1 break-all">{ui.creating.error}</div>
                </div>
                <div class="mt-4 flex justify-end gap-3">
                  <Button variant="ghost" onClick={resetSessionCreation}>
                    {creatingCopy().close}
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      const project = layout.projects.list().find((item) => item.worktree === ui.creating.projectRoot)
                      if (!project) {
                        resetSessionCreation()
                        return
                      }
                      void startSessionCreation(project)
                    }}
                  >
                    {creatingCopy().retry}
                  </Button>
                </div>
              </div>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  )
}
