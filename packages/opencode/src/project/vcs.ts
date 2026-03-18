import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { $ } from "bun"
import path from "path"
import z from "zod"
import { Log } from "@/util/log"
import { Instance } from "./instance"
import { FileWatcher } from "@/file/watcher"

const log = Log.create({ service: "vcs" })

export namespace Vcs {
  export const Event = {
    BranchUpdated: BusEvent.define(
      "vcs.branch.updated",
      z.object({
        branch: z.string().optional(),
      }),
    ),
  }

  const SubmoduleInfoSchema: z.ZodType<any> = z.object({
    path: z.string(),
    commit: z.string().optional(),
    branch: z.string().optional(),
    submodules: z.array(z.lazy(() => SubmoduleInfoSchema)).optional(),
    recentBranches: z.array(z.string()).optional(),
    localBranches: z.array(z.string()).optional(),
    remoteBranches: z.array(z.string()).optional(),
  })
  export const SubmoduleInfo = SubmoduleInfoSchema
  export type SubmoduleInfo = z.infer<typeof SubmoduleInfoSchema>

  export const Info = z
    .object({
      branch: z.string(),
      worktree: z.string().optional(),
      submodules: z.array(SubmoduleInfo).optional(),
      branches: z.array(z.string()).optional(),
    })
    .meta({
      ref: "VcsInfo",
    })
  export type Info = z.infer<typeof Info>

  async function currentBranch() {
    const primary = Instance.roots?.find((item) => item.primary) ?? Instance.roots?.[0]
    if (primary) {
      return $`git rev-parse --abbrev-ref HEAD`
        .quiet()
        .nothrow()
        .cwd(primary.sessionWorktreeDirectory)
        .text()
        .then((x) => x.trim())
        .catch(() => undefined)
    }
    return $`git rev-parse --abbrev-ref HEAD`
      .quiet()
      .nothrow()
      .cwd(Instance.worktree)
      .text()
      .then((x) => x.trim())
      .catch(() => undefined)
  }

  const GIT_TIMEOUT_MS = 3000

  function withGitTimeout<T>(p: Promise<T>, fallback: T): Promise<T> {
    return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), GIT_TIMEOUT_MS))])
  }

  async function getSubmoduleBranches(submodulePath: string) {
    const fullPath = path.join(Instance.worktree, submodulePath)
    const branches: {
      recent: string[]
      local: string[]
      remote: string[]
    } = {
      recent: [],
      local: [],
      remote: [],
    }

    try {
      const recentResult = await withGitTimeout(
        $`git -C ${fullPath} branch --sort=-committerdate --format="%(refname:short)"`
          .quiet()
          .nothrow()
          .cwd(Instance.worktree)
          .text()
          .catch(() => ""),
        "",
      )
      if (recentResult.trim()) {
        branches.recent = recentResult
          .trim()
          .split("\n")
          .filter((b) => b.trim() && !b.includes("HEAD"))
          .slice(0, 5)
      }

      const localResult = await withGitTimeout(
        $`git -C ${fullPath} branch --list --format="%(refname:short)"`
          .quiet()
          .nothrow()
          .cwd(Instance.worktree)
          .text()
          .catch(() => ""),
        "",
      )
      if (localResult.trim()) {
        branches.local = localResult
          .trim()
          .split("\n")
          .filter((b) => b.trim())
          .sort()
      }

      const remoteResult = await withGitTimeout(
        $`git -C ${fullPath} branch -r --list --format="%(refname:short)"`
          .quiet()
          .nothrow()
          .cwd(Instance.worktree)
          .text()
          .catch(() => ""),
        "",
      )
      if (remoteResult.trim()) {
        branches.remote = remoteResult
          .trim()
          .split("\n")
          .filter((b) => b.trim() && !b.includes("HEAD"))
          .map((b) => b.replace(/^origin\//, ""))
          .sort()
      }
    } catch {
      // Ignore errors
    }

    return branches
  }

  async function getSubmoduleInfo(submodulePath: string, basePath: string): Promise<SubmoduleInfo | null> {
    const fullPath = path.join(basePath, submodulePath)

    const commit = await withGitTimeout(
      $`git -C ${fullPath} rev-parse --short HEAD`
        .quiet()
        .nothrow()
        .cwd(basePath)
        .text()
        .then((x) => x.trim())
        .catch(() => undefined),
      undefined,
    )

    const raw = await withGitTimeout(
      $`git -C ${fullPath} rev-parse --abbrev-ref HEAD`
        .quiet()
        .nothrow()
        .cwd(basePath)
        .text()
        .then((x) => x.trim())
        .catch(() => undefined),
      undefined,
    )
    const branch = raw && raw !== "HEAD" ? raw : undefined

    const branches = await getSubmoduleBranches(submodulePath)

    return {
      path: submodulePath,
      commit,
      branch,
      recentBranches: branches.recent.length > 0 ? branches.recent : undefined,
      localBranches: branches.local.length > 0 ? branches.local : undefined,
      remoteBranches: branches.remote.length > 0 ? branches.remote : undefined,
    }
  }

  export async function getSubmodules(): Promise<SubmoduleInfo[]> {
    if (Instance.roots?.length) return []
    const result = await withGitTimeout(
      $`git submodule status`
        .quiet()
        .nothrow()
        .cwd(Instance.worktree)
        .text()
        .catch(() => ""),
      "",
    )

    if (!result.trim()) return []

    const lines = result.trim().split("\n")
    const paths = lines
      .map((line) => line.trim().split(/\s+/)[1])
      .filter((p): p is string => !!p)

    const infos = await Promise.all(
      paths.map((p) => withGitTimeout(getSubmoduleInfo(p, Instance.worktree), null)),
    )
    return infos.filter((x): x is SubmoduleInfo => x !== null)
  }

  export async function getBranches() {
    if (Instance.roots?.length) {
      const items = await Promise.all(
        Instance.roots.map(async (root) => {
          if (root.vcs !== "git") return [] as string[]
          const current = await $`git branch --show-current`
            .quiet()
            .nothrow()
            .cwd(root.sessionWorktreeDirectory)
            .text()
            .then((x) => x.trim())
            .catch(() => "")
          return current ? [`${root.slug}: ${current}`] : []
        }),
      )
      return items.flat()
    }
    const result = await withGitTimeout(
      $`git branch --list --format="%(refname:short)"`
        .quiet()
        .nothrow()
        .cwd(Instance.worktree)
        .text()
        .catch(() => ""),
      "",
    )

    if (!result.trim()) return []

    return result
      .trim()
      .split("\n")
      .filter((b) => b.trim())
      .sort()
  }

  const state = Instance.state(
    async () => {
      if (Instance.project.vcs !== "git") {
        return { branch: async () => undefined, unsubscribe: undefined }
      }
      let current = await currentBranch()
      log.info("initialized", { branch: current })

      const unsubscribe = Bus.subscribe(FileWatcher.Event.Updated, async (evt) => {
        // Only process HEAD file changes for branch detection
        // FileWatcher now only watches HEAD file, so this check ensures we only process HEAD changes
        if (!evt.properties.file.endsWith("HEAD")) return
        const next = await currentBranch()
        if (next !== current) {
          log.info("branch changed", { from: current, to: next })
          current = next
          Bus.publish(Event.BranchUpdated, { branch: next })
        }
      })

      return {
        branch: async () => current,
        unsubscribe,
      }
    },
    async (state) => {
      state.unsubscribe?.()
    },
  )

  export async function init() {
    return state()
  }

  export async function branch() {
    return await state().then((s) => s.branch())
  }
}
