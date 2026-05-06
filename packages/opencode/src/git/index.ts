import fs from "fs"
import path from "path"
import z from "zod"
import { Project } from "@/project/project"
import { Log } from "@/util/log"
import { Filesystem } from "@/util/filesystem"
import { UserWorktree } from "@/worktree/user-worktree"
import { Workspace } from "@/workspace"
import { Snapshot } from "@/snapshot"

const log = Log.create({ service: "git" })
const emptyTree = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
const unit = "\u001f"
const record = "\u001e"

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
      log.warn("git.resolve.workspacePrimaryFailed", { absolute, err: String(err) })
      return absolute
    }
  }

  try {
    const { project, sandbox } = await Project.fromDirectory(absolute)
    if (project.vcs !== "git") return absolute
    return UserWorktree.getOrCreate(project.id, sandbox)
  } catch (err) {
    log.warn("git.resolve.fromDirectoryFailed", { absolute, err: String(err) })
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
  return {
    code,
    out: out.replace(/\s+$/, ""),
    err,
  }
}

async function gitRoot(directory: string) {
  const cwd = await resolveGitWorktree(directory)
  if (!fs.existsSync(cwd)) return

  const inside = await spawnGit(cwd, ["rev-parse", "--is-inside-work-tree"])
  if (inside.code !== 0 || inside.out !== "true") return

  const top = await spawnGit(cwd, ["rev-parse", "--show-toplevel"])
  if (top.code !== 0 || !top.out) return
  return top.out.trim()
}

function parseRefs(input: string, remotes: string[]) {
  if (!input) return []

  const classify = (name: string) => {
    const remote = remotes.some((item) => name === `${item}/HEAD` || name.startsWith(`${item}/`))
    return {
      name,
      kind: remote ? "remote" : "local",
    } as const
  }

  const result: { name: string; kind: "head" | "local" | "remote" | "tag" }[] = []

  for (const item of input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)) {
    if (item === "HEAD") {
      result.push({ name: "HEAD", kind: "head" })
      continue
    }
    if (item.startsWith("HEAD -> ")) {
      result.push({ name: "HEAD", kind: "head" })
      result.push(classify(item.slice("HEAD -> ".length).trim()))
      continue
    }
    if (item.startsWith("tag: ")) {
      result.push({ name: item.slice("tag: ".length).trim(), kind: "tag" })
      continue
    }
    result.push(classify(item))
  }

  return result
}

function parseHistoryEntry(input: string, remotes: string[]) {
  const [oid, short, parents, author_name, author_email, authored_at, refs, subject] = input.split(unit)
  if (!oid || !short) return

  return {
    oid,
    short,
    parents: parents ? parents.split(" ").filter(Boolean) : [],
    author_name: author_name ?? "",
    author_email: author_email ?? "",
    authored_at: Number(authored_at ?? "0") * 1000,
    refs: parseRefs(refs ?? "", remotes),
    subject: subject ?? "",
  }
}

async function remoteNames(root: string) {
  const result = await spawnGit(root, ["remote"])
  if (result.code !== 0 || !result.out) return [] as string[]
  return result.out
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
}

async function showFile(root: string, ref: string, file: string) {
  const result = await spawnGit(root, ["show", `${ref}:${file}`])
  if (result.code !== 0) return ""
  return result.out
}

export namespace Git {
  export const Ref = z
    .object({
      name: z.string(),
      kind: z.enum(["head", "local", "remote", "tag"]),
    })
    .meta({ ref: "GitRef" })

  export const HistoryEntry = z
    .object({
      oid: z.string(),
      short: z.string(),
      parents: z.array(z.string()),
      author_name: z.string(),
      author_email: z.string(),
      authored_at: z.number(),
      refs: z.array(Ref),
      subject: z.string(),
    })
    .meta({ ref: "GitHistoryEntry" })

  export const HistoryPage = z
    .object({
      items: z.array(HistoryEntry),
      next: z.string().optional(),
    })
    .meta({ ref: "GitHistoryPage" })

  export const CommitFile = z
    .object({
      path: z.string(),
      additions: z.number(),
      deletions: z.number(),
      status: z.enum(["added", "deleted", "modified"]),
    })
    .meta({ ref: "GitCommitFile" })

  export const CommitDetail = z
    .object({
      oid: z.string(),
      short: z.string(),
      parents: z.array(z.string()),
      author_name: z.string(),
      author_email: z.string(),
      authored_at: z.number(),
      refs: z.array(Ref),
      subject: z.string(),
      body: z.string().optional(),
      files: z.array(CommitFile),
      diffs: z.array(Snapshot.FileDiff),
    })
    .meta({ ref: "GitCommitDetail" })

  export async function history(input: { directory: string; limit?: number; cursor?: string }) {
    const root = await gitRoot(input.directory)
    if (!root) return { items: [], next: undefined }

    const limit = Math.min(500, Math.max(1, input.limit ?? 60))
    const skip = Math.max(0, Number(input.cursor ?? "0") || 0)
    const remotes = await remoteNames(root)
    const format = ["%H", "%h", "%P", "%an", "%ae", "%at", "%D", "%s"].join(unit) + record
    const result = await spawnGit(root, [
      "log",
      "--all",
      "--topo-order",
      `--skip=${skip}`,
      `--max-count=${limit + 1}`,
      "--decorate=short",
      `--pretty=format:${format}`,
    ])
    if (result.code !== 0 || !result.out) return { items: [], next: undefined }

    const items = result.out
      .split(record)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => parseHistoryEntry(item, remotes))
      .filter((item): item is z.infer<typeof HistoryEntry> => !!item)

    return {
      items: items.slice(0, limit),
      next: items.length > limit ? String(skip + limit) : undefined,
    }
  }

  export async function commit(input: { directory: string; oid: string }) {
    const root = await gitRoot(input.directory)
    if (!root) {
      return {
        oid: input.oid,
        short: input.oid.slice(0, 7),
        parents: [],
        author_name: "",
        author_email: "",
        authored_at: 0,
        refs: [],
        subject: "",
        body: undefined,
        files: [],
        diffs: [],
      }
    }

    const remotes = await remoteNames(root)
    const format = ["%H", "%h", "%P", "%an", "%ae", "%at", "%D", "%s", "%b"].join(unit)
    const meta = await spawnGit(root, ["show", "--quiet", "--decorate=short", `--pretty=format:${format}`, input.oid])
    if (meta.code !== 0 || !meta.out) {
      return {
        oid: input.oid,
        short: input.oid.slice(0, 7),
        parents: [],
        author_name: "",
        author_email: "",
        authored_at: 0,
        refs: [],
        subject: "",
        body: undefined,
        files: [],
        diffs: [],
      }
    }

    const [oid, short, parents, author_name, author_email, authored_at, refs, subject, body] = meta.out.split(unit)
    const base = parents?.split(" ").filter(Boolean)[0] ?? emptyTree
    const statusResult = await spawnGit(root, [
      "diff",
      "--no-ext-diff",
      "--name-status",
      "--no-renames",
      base,
      oid,
      "--",
    ])
    const numstatResult = await spawnGit(root, ["diff", "--no-ext-diff", "--no-renames", "--numstat", base, oid, "--"])
    const status = new Map<string, "added" | "deleted" | "modified">()

    if (statusResult.code === 0 && statusResult.out) {
      for (const line of statusResult.out.split("\n")) {
        const [code, file] = line.split("\t")
        if (!code || !file) continue
        status.set(file, code.startsWith("A") ? "added" : code.startsWith("D") ? "deleted" : "modified")
      }
    }

    const files: z.infer<typeof CommitFile>[] = []
    const diffs: z.infer<typeof Snapshot.FileDiff>[] = []

    for (const line of numstatResult.out.split("\n")) {
      const [additions, deletions, file] = line.split("\t")
      if (!file) continue

      const binary = additions === "-" && deletions === "-"
      const kind = status.get(file) ?? "modified"
      const added = binary ? 0 : Number(additions)
      const removed = binary ? 0 : Number(deletions)
      const before = kind === "added" || binary || base === emptyTree ? "" : await showFile(root, base, file)
      const after = kind === "deleted" || binary ? "" : await showFile(root, oid, file)

      files.push({
        path: file,
        additions: Number.isFinite(added) ? added : 0,
        deletions: Number.isFinite(removed) ? removed : 0,
        status: kind,
      })
      diffs.push({
        file,
        before,
        after,
        additions: Number.isFinite(added) ? added : 0,
        deletions: Number.isFinite(removed) ? removed : 0,
        status: kind,
      })
    }

    return {
      oid,
      short,
      parents: parents ? parents.split(" ").filter(Boolean) : [],
      author_name: author_name ?? "",
      author_email: author_email ?? "",
      authored_at: Number(authored_at ?? "0") * 1000,
      refs: parseRefs(refs ?? "", remotes),
      subject: subject ?? "",
      body: body?.trim() || undefined,
      files,
      diffs,
    }
  }
}
