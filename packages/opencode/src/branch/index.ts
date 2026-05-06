import path from "path"
import fs from "fs"
import { $ } from "bun"
import { Log } from "@/util/log"
import { Filesystem } from "@/util/filesystem"
import { Project } from "@/project/project"
import { UserWorktree } from "@/worktree/user-worktree"
import { Workspace } from "@/workspace"

const log = Log.create({ service: "branch" })

/** Same effective git cwd as Instance.worktree (see project/instance.ts provide). */
async function resolveGitWorktree(requested: string) {
  const absolute = path.resolve(requested)
  if (!fs.existsSync(absolute)) return absolute

  const scoped = await Workspace.fromDirectory(absolute)
  if (scoped) {
    try {
      const root = scoped.session?.roots.find(
        (item) =>
          Filesystem.contains(item.sessionWorktreeDirectory, absolute) ||
          Filesystem.contains(item.sourceDirectory, absolute),
      )
      if (root?.vcs === "git") return root.sessionWorktreeDirectory

      const projectRoot = scoped.workspace.projects.find((item) => Filesystem.contains(item.sourceDirectory, absolute))
      if (projectRoot?.vcs === "git") return projectRoot.sourceDirectory

      const project = await Workspace.primaryProject(scoped)
      if (project.vcs !== "git") return absolute
      return (
        scoped.session?.roots.find((item) => item.primary)?.sessionWorktreeDirectory ??
        scoped.workspace.projects.find((item) => item.primary)?.sourceDirectory ??
        project.worktree
      )
    } catch (err) {
      log.warn("branch.resolve.workspacePrimaryFailed", { absolute, err: String(err) })
      return absolute
    }
  }

  try {
    const { project, sandbox } = await Project.fromDirectory(absolute)
    if (project.vcs !== "git") return absolute
    return UserWorktree.getOrCreate(project.id, sandbox)
  } catch (err) {
    log.warn("branch.resolve.fromDirectoryFailed", { absolute, err: String(err) })
    return absolute
  }
}

async function spawnGit(cwd: string, args: string[]) {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  })
  const out = await new Response(proc.stdout).text()
  const err = await new Response(proc.stderr).text()
  const code = await proc.exited
  return { code, out: out.replace(/\s+$/, ""), err }
}

function parseLocalPlain(out: string) {
  return out
    .split("\n")
    .map((line) => line.replace(/^\*?\s+/, "").trim())
    .filter((b) => b.length > 0)
}

function parseRemotePlain(out: string) {
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter((b) => b.length > 0 && !b.includes("HEAD"))
    .map((b) => b.replace(/^origin\//, ""))
}

export namespace Branch {
  export async function list(directory: string) {
    const cwd = await resolveGitWorktree(directory)
    if (!fs.existsSync(cwd)) {
      log.warn("branch.list.missingPath", { directory, cwd })
      return { local: [], remote: [], current: undefined }
    }

    const inside = await spawnGit(cwd, ["rev-parse", "--is-inside-work-tree"])
    if (inside.code !== 0 || inside.out !== "true") {
      log.warn("branch.list.notGit", { directory, cwd, stderr: inside.err.slice(0, 240) })
      return { local: [], remote: [], current: undefined }
    }

    const top = await spawnGit(cwd, ["rev-parse", "--show-toplevel"])
    const root = top.code === 0 && top.out ? top.out.trim() : cwd

    const [localFmt, remoteFmt, headR] = await Promise.all([
      spawnGit(root, ["branch", "--list", "--format=%(refname:short)"]),
      spawnGit(root, ["branch", "-r", "--format=%(refname:short)"]),
      spawnGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
    ])

    let local =
      localFmt.code === 0 && localFmt.out
        ? localFmt.out
            .split("\n")
            .map((line) => line.trim())
            .filter((b) => b.length > 0)
        : []
    if (local.length === 0) {
      const plain = await spawnGit(root, ["branch", "--list"])
      if (plain.code === 0 && plain.out) local = parseLocalPlain(plain.out)
      if (local.length === 0 && localFmt.code !== 0)
        log.warn("branch.list.localFailed", { root, stderr: localFmt.err.slice(0, 240) })
    }

    let remote =
      remoteFmt.code === 0 && remoteFmt.out
        ? remoteFmt.out
            .split("\n")
            .map((line) => line.trim())
            .filter((b) => b.length > 0 && !b.includes("HEAD"))
            .map((b) => b.replace(/^origin\//, ""))
        : []
    if (remote.length === 0) {
      const plain = await spawnGit(root, ["branch", "-r"])
      if (plain.code === 0 && plain.out) remote = parseRemotePlain(plain.out)
    }

    let current: string | undefined
    if (headR.code === 0) {
      const val = headR.out.trim()
      if (val && val !== "HEAD") current = val
    }

    return { local, remote, current }
  }

  export async function refresh(directory: string) {
    const cwd = await resolveGitWorktree(directory)
    if (fs.existsSync(cwd)) {
      const r = await spawnGit(cwd, ["fetch", "--all", "--prune", "--tags"])
      if (r.code !== 0) log.warn("branch.refresh.fetchFailed", { cwd, stderr: r.err.slice(0, 240) })
    }
    return list(directory)
  }

  export function filter(branches: string[], query: string) {
    if (!query) return branches
    const lower = query.toLowerCase()
    return branches.filter((b) => b.toLowerCase().includes(lower))
  }

  export async function validate(name: string, directory: string) {
    const cwd = await resolveGitWorktree(directory)
    const result = await $`git check-ref-format --branch ${name}`.quiet().nothrow().cwd(cwd)
    return result.exitCode === 0
  }

  export async function exists(name: string, directory: string) {
    const cwd = await resolveGitWorktree(directory)
    const result = await $`git show-ref --verify --quiet refs/heads/${name}`.quiet().nothrow().cwd(cwd)
    return result.exitCode === 0
  }
}
