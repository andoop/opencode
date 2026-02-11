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
    return $`git rev-parse --abbrev-ref HEAD`
      .quiet()
      .nothrow()
      .cwd(Instance.worktree)
      .text()
      .then((x) => x.trim())
      .catch(() => undefined)
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
      // Get recent branches (last 5 checked out)
      const recentResult = await $`git -C ${fullPath} reflog show --format="%(refname:short)" --date=relative --no-walk HEAD 2>/dev/null || git -C ${fullPath} branch --sort=-committerdate --format="%(refname:short)" | head -5`
        .quiet()
        .nothrow()
        .cwd(Instance.worktree)
        .text()
        .catch(() => "")
      if (recentResult.trim()) {
        branches.recent = recentResult
          .trim()
          .split("\n")
          .filter((b) => b.trim() && !b.includes("HEAD"))
          .slice(0, 5)
      }

      // Get local branches
      const localResult = await $`git -C ${fullPath} branch --list --format="%(refname:short)"`
        .quiet()
        .nothrow()
        .cwd(Instance.worktree)
        .text()
        .catch(() => "")
      if (localResult.trim()) {
        branches.local = localResult
          .trim()
          .split("\n")
          .filter((b) => b.trim())
          .sort()
      }

      // Get remote branches
      const remoteResult = await $`git -C ${fullPath} branch -r --list --format="%(refname:short)"`
        .quiet()
        .nothrow()
        .cwd(Instance.worktree)
        .text()
        .catch(() => "")
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

    // Get commit hash
    let commit: string | undefined
    try {
      const commitResult = await $`git -C ${fullPath} rev-parse --short HEAD`
        .quiet()
        .nothrow()
        .cwd(basePath)
        .text()
        .then((x) => x.trim())
        .catch(() => undefined)
      if (commitResult) commit = commitResult
    } catch {
      // Ignore errors
    }

    // Get current branch
    let branch: string | undefined
    try {
      const branchResult = await $`git -C ${fullPath} rev-parse --abbrev-ref HEAD`
        .quiet()
        .nothrow()
        .cwd(basePath)
        .text()
        .then((x) => x.trim())
        .catch(() => undefined)
      if (branchResult && branchResult !== "HEAD") branch = branchResult
    } catch {
      // Ignore errors
    }

    // Get branches
    const branches = await getSubmoduleBranches(submodulePath)

    // Recursively get nested submodules
    let nestedSubmodules: SubmoduleInfo[] | undefined
    try {
      const nestedResult = await $`git -C ${fullPath} submodule status`
        .quiet()
        .nothrow()
        .cwd(basePath)
        .text()
        .catch(() => "")

      if (nestedResult.trim()) {
        const nested: SubmoduleInfo[] = []
        const lines = nestedResult.trim().split("\n")

        for (const line of lines) {
          const parts = line.trim().split(/\s+/)
          if (parts.length < 2) continue

          const nestedPath = parts[1]
          if (!nestedPath) continue

          const nestedInfo = await getSubmoduleInfo(nestedPath, fullPath)
          if (nestedInfo) nested.push(nestedInfo)
        }

        if (nested.length > 0) nestedSubmodules = nested
      }
    } catch {
      // Ignore errors
    }

    return {
      path: submodulePath,
      commit,
      branch,
      recentBranches: branches.recent.length > 0 ? branches.recent : undefined,
      localBranches: branches.local.length > 0 ? branches.local : undefined,
      remoteBranches: branches.remote.length > 0 ? branches.remote : undefined,
      submodules: nestedSubmodules,
    }
  }

  export async function getSubmodules(): Promise<SubmoduleInfo[]> {
    const result = await $`git submodule status`
      .quiet()
      .nothrow()
      .cwd(Instance.worktree)
      .text()
      .catch(() => "")

    if (!result.trim()) return []

    const submodules: SubmoduleInfo[] = []
    const lines = result.trim().split("\n")

    for (const line of lines) {
      // git submodule status format: " <flags><sha1> <path> (<description>)"
      // Example: " 160000 abc123... path/to/submodule (v1.2.3)"
      const parts = line.trim().split(/\s+/)
      if (parts.length < 2) continue

      const submodulePath = parts[1]
      if (!submodulePath) continue

      const info = await getSubmoduleInfo(submodulePath, Instance.worktree)
      if (info) submodules.push(info)
    }

    return submodules
  }

  export async function getBranches() {
    const result = await $`git branch --list --format="%(refname:short)"`
      .quiet()
      .nothrow()
      .cwd(Instance.worktree)
      .text()
      .catch(() => "")

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
