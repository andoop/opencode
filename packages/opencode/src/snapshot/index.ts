import { $ } from "bun"
import path from "path"
import fs from "fs/promises"
import { Log } from "../util/log"
import { Global } from "../global"
import z from "zod"
import { Config } from "../config/config"
import { Instance } from "../project/instance"
import { Scheduler } from "../scheduler"

export namespace Snapshot {
  const log = Log.create({ service: "snapshot" })
  const hour = 60 * 60 * 1000
  const prune = "7.days"
  const multiPrefix = "multi:"

  type RootEntry = {
    projectID: string
    slug?: string
    worktree: string
    cwd: string
  }

  function rootEntries() {
    if (!Instance.roots?.length) {
      return [
        {
          projectID: Instance.project.id,
          slug: undefined,
          worktree: Instance.worktree,
          cwd: Instance.directory,
        },
      ] satisfies RootEntry[]
    }
    return Instance.roots.map((item) => ({
      projectID: item.projectID,
      slug: item.slug,
      worktree: item.sessionWorktreeDirectory,
      cwd: item.sessionWorktreeDirectory,
    }))
  }

  function scope() {
    return Instance.session?.id ?? Instance.workspace?.id ?? Instance.project.id
  }

  function gitdir(projectID?: string) {
    if (projectID) {
      return path.join(Global.Path.data, "snapshot", scope(), projectID)
    }
    const project = Instance.project
    return path.join(Global.Path.data, "snapshot", project.id)
  }

  function encodeMulti(input: Record<string, string>) {
    return multiPrefix + Buffer.from(JSON.stringify(input)).toString("base64url")
  }

  function decodeMulti(input: string) {
    if (!input.startsWith(multiPrefix)) return
    return JSON.parse(Buffer.from(input.slice(multiPrefix.length), "base64url").toString()) as Record<string, string>
  }

  async function trackRoot(root: RootEntry) {
    const cfg = await Config.get()
    if (cfg.snapshot === false) return ""
    const git = gitdir(root.projectID)
    if (await fs.mkdir(git, { recursive: true })) {
      await $`git init`
        .env({
          ...process.env,
          GIT_DIR: git,
          GIT_WORK_TREE: root.worktree,
        })
        .quiet()
        .nothrow()
      await $`git --git-dir ${git} config core.autocrlf false`.quiet().nothrow()
    }
    await $`git --git-dir ${git} --work-tree ${root.worktree} add .`.quiet().cwd(root.cwd).nothrow()
    return $`git --git-dir ${git} --work-tree ${root.worktree} write-tree`
      .quiet()
      .cwd(root.cwd)
      .nothrow()
      .text()
      .then((x) => x.trim())
  }

  async function patchRoot(hash: string, root: RootEntry): Promise<Patch> {
    const git = gitdir(root.projectID)
    await $`git --git-dir ${git} --work-tree ${root.worktree} add .`.quiet().cwd(root.cwd).nothrow()
    const result =
      await $`git -c core.autocrlf=false -c core.quotepath=false --git-dir ${git} --work-tree ${root.worktree} diff --no-ext-diff --name-only ${hash} -- .`
        .quiet()
        .cwd(root.cwd)
        .nothrow()
    if (result.exitCode !== 0) {
      return { hash, files: [] }
    }
    const files = result.text()
    return {
      hash,
      files: files
        .trim()
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => path.join(root.worktree, x)),
    }
  }

  async function restoreRoot(snapshot: string, root: RootEntry) {
    const git = gitdir(root.projectID)
    await $`git --git-dir ${git} --work-tree ${root.worktree} read-tree ${snapshot} && git --git-dir ${git} --work-tree ${root.worktree} checkout-index -a -f`
      .quiet()
      .cwd(root.worktree)
      .nothrow()
  }

  async function diffRoot(hash: string, root: RootEntry) {
    const git = gitdir(root.projectID)
    await $`git --git-dir ${git} --work-tree ${root.worktree} add .`.quiet().cwd(root.cwd).nothrow()
    const result =
      await $`git -c core.autocrlf=false -c core.quotepath=false --git-dir ${git} --work-tree ${root.worktree} diff --no-ext-diff ${hash} -- .`
        .quiet()
        .cwd(root.worktree)
        .nothrow()
    if (result.exitCode !== 0) return ""
    return result.text().trim()
  }

  async function diffFullRoot(from: string, to: string, root: RootEntry): Promise<FileDiff[]> {
    const git = gitdir(root.projectID)
    const result: FileDiff[] = []
    const status = new Map<string, "added" | "deleted" | "modified">()
    const statuses =
      await $`git -c core.autocrlf=false -c core.quotepath=false --git-dir ${git} --work-tree ${root.worktree} diff --no-ext-diff --name-status --no-renames ${from} ${to} -- .`
        .quiet()
        .cwd(root.cwd)
        .nothrow()
        .text()
    for (const line of statuses.trim().split("\n")) {
      if (!line) continue
      const [code, file] = line.split("\t")
      if (!code || !file) continue
      const kind = code.startsWith("A") ? "added" : code.startsWith("D") ? "deleted" : "modified"
      status.set(file, kind)
    }
    for await (const line of $`git -c core.autocrlf=false -c core.quotepath=false --git-dir ${git} --work-tree ${root.worktree} diff --no-ext-diff --no-renames --numstat ${from} ${to} -- .`
      .quiet()
      .cwd(root.cwd)
      .nothrow()
      .lines()) {
      if (!line) continue
      const [additions, deletions, file] = line.split("\t")
      const isBinaryFile = additions === "-" && deletions === "-"
      const before = isBinaryFile
        ? ""
        : await $`git -c core.autocrlf=false --git-dir ${git} --work-tree ${root.worktree} show ${from}:${file}`
            .quiet()
            .nothrow()
            .text()
      const after = isBinaryFile
        ? ""
        : await $`git -c core.autocrlf=false --git-dir ${git} --work-tree ${root.worktree} show ${to}:${file}`
            .quiet()
            .nothrow()
            .text()
      const added = isBinaryFile ? 0 : parseInt(additions)
      const deleted = isBinaryFile ? 0 : parseInt(deletions)
      result.push({
        file: root.slug ? path.join("roots", root.slug, file) : file,
        before,
        after,
        additions: Number.isFinite(added) ? added : 0,
        deletions: Number.isFinite(deleted) ? deleted : 0,
        status: status.get(file) ?? "modified",
      })
    }
    return result
  }

  export function init() {
    Scheduler.register({
      id: "snapshot.cleanup",
      interval: hour,
      run: cleanup,
      scope: "instance",
    })
  }

  export async function cleanup() {
    if (Instance.project.vcs !== "git" && !Instance.roots?.length) return
    const cfg = await Config.get()
    if (cfg.snapshot === false) return
    for (const root of rootEntries()) {
      const git = gitdir(root.projectID)
      const exists = await fs
        .stat(git)
        .then(() => true)
        .catch(() => false)
      if (!exists) continue
      const result = await $`git --git-dir ${git} --work-tree ${root.worktree} gc --prune=${prune}`
        .quiet()
        .cwd(root.cwd)
        .nothrow()
      if (result.exitCode !== 0) {
        log.warn("cleanup failed", {
          exitCode: result.exitCode,
          stderr: result.stderr.toString(),
          stdout: result.stdout.toString(),
        })
      }
    }
    log.info("cleanup", { prune, scope: scope() })
  }

  export async function track() {
    const roots = rootEntries()
    if (roots.length === 1 && !Instance.roots?.length) {
      const hash = await trackRoot(roots[0]!)
      log.info("tracking", { hash, cwd: Instance.directory, git: gitdir() })
      return hash.trim()
    }
    const entries = await Promise.all(roots.map(async (root) => [root.projectID, await trackRoot(root)] as const))
    return encodeMulti(Object.fromEntries(entries))
  }

  export const Patch = z.object({
    hash: z.string(),
    files: z.string().array(),
  })
  export type Patch = z.infer<typeof Patch>

  export async function patch(hash: string): Promise<Patch> {
    const multi = decodeMulti(hash)
    if (multi) {
      const result = await Promise.all(
        rootEntries().map(async (root) => {
          const value = multi[root.projectID]
          if (!value) return { hash, files: [] } satisfies Patch
          return patchRoot(value, root)
        }),
      )
      return {
        hash,
        files: result.flatMap((item) => item.files),
      }
    }
    return patchRoot(hash, rootEntries()[0]!)
  }

  export async function restore(snapshot: string) {
    log.info("restore", { commit: snapshot })
    const multi = decodeMulti(snapshot)
    if (multi) {
      await Promise.all(
        rootEntries().map(async (root) => {
          const value = multi[root.projectID]
          if (!value) return
          await restoreRoot(value, root)
        }),
      )
      return
    }
    await restoreRoot(snapshot, rootEntries()[0]!)
  }

  export async function revert(patches: Patch[]) {
    const multi = patches.some((item) => !!decodeMulti(item.hash))
    if (multi) {
      for (const patch of patches) {
        const hashes = decodeMulti(patch.hash)
        if (!hashes) continue
        for (const file of patch.files) {
          const root = Instance.rootForPath(file)
          if (!root) continue
          const hash = hashes[root.projectID]
          if (!hash) continue
          const git = gitdir(root.projectID)
          const relative = path.relative(root.sessionWorktreeDirectory, file)
          const result =
            await $`git --git-dir ${git} --work-tree ${root.sessionWorktreeDirectory} checkout ${hash} -- ${relative}`
              .quiet()
              .cwd(root.sessionWorktreeDirectory)
              .nothrow()
          if (result.exitCode !== 0) {
            await fs.unlink(file).catch(() => {})
          }
        }
      }
      return
    }
    const files = new Set<string>()
    const git = gitdir()
    for (const item of patches) {
      for (const file of item.files) {
        if (files.has(file)) continue
        log.info("reverting", { file, hash: item.hash })
        const result = await $`git --git-dir ${git} --work-tree ${Instance.worktree} checkout ${item.hash} -- ${file}`
          .quiet()
          .cwd(Instance.worktree)
          .nothrow()
        if (result.exitCode !== 0) {
          const relativePath = path.relative(Instance.worktree, file)
          const checkTree =
            await $`git --git-dir ${git} --work-tree ${Instance.worktree} ls-tree ${item.hash} -- ${relativePath}`
              .quiet()
              .cwd(Instance.worktree)
              .nothrow()
          if (checkTree.exitCode === 0 && checkTree.text().trim()) {
            log.info("file existed in snapshot but checkout failed, keeping", {
              file,
            })
          } else {
            log.info("file did not exist in snapshot, deleting", { file })
            await fs.unlink(file).catch(() => {})
          }
        }
        files.add(file)
      }
    }
  }

  export async function diff(hash: string) {
    const multi = decodeMulti(hash)
    if (multi) {
      const diffs = await Promise.all(
        rootEntries().map(async (root) => {
          const value = multi[root.projectID]
          if (!value) return ""
          const text = await diffRoot(value, root)
          if (!text) return ""
          return [`# ${root.slug ?? root.projectID}`, text].join("\n")
        }),
      )
      return diffs.filter(Boolean).join("\n\n")
    }
    return diffRoot(hash, rootEntries()[0]!)
  }

  export const FileDiff = z
    .object({
      file: z.string(),
      before: z.string(),
      after: z.string(),
      additions: z.number(),
      deletions: z.number(),
      status: z.enum(["added", "deleted", "modified"]).optional(),
    })
    .meta({
      ref: "FileDiff",
    })
  export type FileDiff = z.infer<typeof FileDiff>
  export async function diffFull(from: string, to: string): Promise<FileDiff[]> {
    const fromMulti = decodeMulti(from)
    const toMulti = decodeMulti(to)
    if (fromMulti && toMulti) {
      const diffs = await Promise.all(
        rootEntries().map(async (root) => {
          const before = fromMulti[root.projectID]
          const after = toMulti[root.projectID]
          if (!before || !after) return [] as FileDiff[]
          return diffFullRoot(before, after, root)
        }),
      )
      return diffs.flat()
    }
    return diffFullRoot(from, to, rootEntries()[0]!)
  }
}
