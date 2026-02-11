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

  export const Info = z
    .object({
      branch: z.string(),
      submodules: z.array(z.object({ path: z.string(), branch: z.string().optional() })).optional(),
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

  export async function getSubmodules() {
    const result = await $`git submodule status`
      .quiet()
      .nothrow()
      .cwd(Instance.worktree)
      .text()
      .catch(() => "")

    if (!result.trim()) return []

    const submodules: { path: string; branch?: string }[] = []
    const lines = result.trim().split("\n")

    for (const line of lines) {
      // git submodule status format: " <flags><sha1> <path> (<description>)"
      // Example: " 160000 abc123... path/to/submodule (v1.2.3)"
      const parts = line.trim().split(/\s+/)
      if (parts.length < 2) continue

      const submodulePath = parts[1]
      if (!submodulePath) continue

      let branch: string | undefined
      const fullPath = submodulePath.startsWith("/") ? submodulePath : path.join(Instance.worktree, submodulePath)

      try {
        const branchResult = await $`git -C ${fullPath} rev-parse --abbrev-ref HEAD`
          .quiet()
          .nothrow()
          .cwd(Instance.worktree)
          .text()
          .then((x) => x.trim())
          .catch(() => undefined)
        if (branchResult && branchResult !== "HEAD") branch = branchResult
      } catch {
        // Ignore errors getting branch for submodule
      }

      submodules.push({ path: submodulePath, branch })
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
        if (evt.properties.file.endsWith("HEAD")) return
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
