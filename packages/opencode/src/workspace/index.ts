import fs from "fs/promises"
import path from "path"
import z from "zod"
import { Identifier } from "@/id/id"
import { Project } from "@/project/project"
import { GroupRegistry } from "@/project/group-registry"
import { Global } from "@/global"
import { User } from "@/user"
import { Flag } from "@/flag/flag"
import { NamedError } from "@opencode-ai/util/error"
import { Log } from "@/util/log"
import { Filesystem } from "@/util/filesystem"

export namespace Workspace {
  const log = Log.create({ service: "workspace" })

  export const MissingPrimaryProjectError = NamedError.create(
    "WorkspaceMissingPrimaryProjectError",
    z.object({ workspaceID: z.string() }),
  )

  export const NotFoundError = NamedError.create("WorkspaceNotFoundError", z.object({ workspaceID: z.string() }))

  export const CreateInput = z.object({
    name: z.string().optional(),
    directories: z.array(z.string()).min(1),
    primaryProjectID: z.string().optional(),
    selected_group_ids: z.array(z.string()).default([]).optional(),
  })

  export const ProjectInfo = z.object({
    projectID: z.string(),
    slug: z.string(),
    sourceDirectory: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    group_ids: z.array(z.string()).default([]),
    groups: z.array(z.string()).default([]),
    primary: z.boolean().optional(),
    vcs: z.literal("git").optional(),
  })

  export const Info = z
    .object({
      id: z.string().startsWith("wsp_"),
      name: z.string(),
      directory: z.string(),
      userID: Identifier.schema("user").optional(),
      primaryProjectID: z.string(),
      selected_group_ids: z.array(z.string()).default([]),
      selected_groups: z.array(z.string()).default([]),
      projects: ProjectInfo.array(),
      time: z.object({
        created: z.number(),
        updated: z.number(),
      }),
    })
    .meta({
      ref: "Workspace",
    })

  export type Info = z.infer<typeof Info>
  export type ProjectInfo = z.infer<typeof ProjectInfo>

  export const SessionRoot = z.object({
    projectID: z.string(),
    slug: z.string(),
    sourceDirectory: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    userWorktreeDirectory: z.string(),
    sessionWorktreeDirectory: z.string(),
    primary: z.boolean().optional(),
    vcs: z.literal("git").optional(),
    branch: z.string().optional(),
    baseBranch: z.string().optional(),
    baseCommit: z.string().optional(),
    headCommit: z.string().optional(),
  })

  export type SessionRoot = z.infer<typeof SessionRoot>

  export const SessionState = z.object({
    workspaceID: z.string().startsWith("wsp_"),
    id: Identifier.schema("session"),
    directory: z.string(),
    cwd: z.string(),
    roots: SessionRoot.array(),
  })

  export type SessionState = z.infer<typeof SessionState>

  function isMultiUserMode() {
    return Flag.OPENCODE_MULTI_USER === "true" || Flag.OPENCODE_MULTI_USER === "1"
  }

  function currentUserID() {
    if (!isMultiUserMode()) return "__local__"
    return User.current()?.id ?? "__anonymous__"
  }

  function uniqueSlug(input: string, used: Set<string>) {
    const base =
      input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+/, "")
        .replace(/-+$/, "") || "project"
    if (!used.has(base)) {
      used.add(base)
      return base
    }
    for (let i = 2; i < 1000; i++) {
      const next = `${base}-${i}`
      if (used.has(next)) continue
      used.add(next)
      return next
    }
    return base
  }

  function base() {
    return path.join(Global.Path.data, "workspace", currentUserID())
  }

  export function root(workspaceID: string) {
    return path.join(base(), workspaceID)
  }

  export function file(workspaceID: string) {
    return path.join(root(workspaceID), "workspace.json")
  }

  export function sessionDirectory(workspaceID: string, sessionID: string) {
    return path.join(root(workspaceID), "sessions", sessionID)
  }

  export function sessionFile(workspaceID: string, sessionID: string) {
    return path.join(sessionDirectory(workspaceID, sessionID), "session.json")
  }

  export async function write(info: Info) {
    const target = file(info.id)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await Bun.write(target, JSON.stringify(info, null, 2))
  }

  export async function read(workspaceID: string) {
    const target = file(workspaceID)
    const info = await Bun.file(target)
      .json()
      .catch(() => undefined)
    if (!info) throw new NotFoundError({ workspaceID })
    return Info.parse(info)
  }

  export async function list() {
    const items = await Array.fromAsync(
      new Bun.Glob("*/workspace.json").scan({
        cwd: base(),
        absolute: true,
        onlyFiles: true,
      }),
    ).catch(() => [] as string[])
    const workspaces = await Promise.all(
      items.map((item) =>
        Bun.file(item)
          .json()
          .then((x) => Info.parse(x))
          .catch(() => undefined),
      ),
    )
    return workspaces.filter((item): item is Info => !!item).toSorted((a, b) => b.time.updated - a.time.updated)
  }

  async function projectsFromDirectories(input: z.input<typeof CreateInput>) {
    const parsed = CreateInput.parse(input)
    const seen = new Set<string>()
    const used = new Set<string>()
    const projects = await Promise.all(
      parsed.directories.map(async (directory) => {
        const result = await Project.fromDirectory(directory)
        if (seen.has(result.project.id)) return
        seen.add(result.project.id)
        return ProjectInfo.parse({
          projectID: result.project.id,
          slug: uniqueSlug(result.project.name ?? path.basename(result.project.worktree), used),
          sourceDirectory: result.project.worktree,
          name: result.project.name,
          description: result.project.description,
          group_ids: result.project.group_ids,
          groups: result.project.groups,
          primary: false,
          vcs: result.project.vcs,
        })
      }),
    )
    const roots = projects.filter((item): item is ProjectInfo => !!item)
    const primary = roots.find((item) => item.projectID === parsed.primaryProjectID) ?? roots[0]
    if (!primary) {
      throw new MissingPrimaryProjectError({ workspaceID: "pending" })
    }
    return { parsed, roots, primary }
  }

  export async function create(input: z.input<typeof CreateInput>) {
    const { parsed, roots, primary } = await projectsFromDirectories(input)
    const selectedGroups = await GroupRegistry.names(parsed.selected_group_ids ?? [])
    const id = Identifier.descending("workspace")
    const info = Info.parse({
      id,
      name: parsed.name ?? roots.map((item) => item.name ?? path.basename(item.sourceDirectory)).join(" + "),
      directory: root(id),
      userID: isMultiUserMode() ? User.current()?.id : undefined,
      primaryProjectID: primary.projectID,
      selected_group_ids: parsed.selected_group_ids ?? [],
      selected_groups: selectedGroups,
      projects: roots.map((item) => ({
        ...item,
        primary: item.projectID === primary.projectID,
      })),
      time: {
        created: Date.now(),
        updated: Date.now(),
      },
    })
    await fs.mkdir(path.join(root(id), "sessions"), { recursive: true })
    await write(info)
    return info
  }

  export async function updateProjects(workspaceID: string, directories: string[], primaryProjectID?: string) {
    const current = await read(workspaceID)
    const { roots, primary } = await projectsFromDirectories({
      name: current.name,
      directories,
      primaryProjectID: primaryProjectID ?? current.primaryProjectID,
      selected_group_ids: current.selected_group_ids ?? [],
    })
    const selectedGroups = await GroupRegistry.names(current.selected_group_ids ?? [])
    const info = Info.parse({
      id: current.id,
      name: current.name,
      directory: current.directory,
      userID: current.userID,
      primaryProjectID: primary.projectID,
      selected_group_ids: current.selected_group_ids ?? [],
      selected_groups: selectedGroups,
      projects: roots.map((item) => ({
        ...item,
        primary: item.projectID === primary.projectID,
      })),
      time: {
        created: current.time.created,
        updated: Date.now(),
      },
    })
    await write(info)
    return info
  }

  export async function remove(workspaceID: string) {
    await fs.rm(root(workspaceID), {
      recursive: true,
      force: true,
    })
  }

  export async function availableProjects() {
    return Project.list()
  }

  async function readSessionState(filepath: string) {
    const data = await Bun.file(filepath)
      .json()
      .catch(() => undefined)
    if (!data) return
    return SessionState.parse(data)
  }

  export async function writeSessionState(input: SessionState) {
    const target = sessionFile(input.workspaceID, input.id)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await Bun.write(target, JSON.stringify(input, null, 2))
  }

  export async function getSessionState(workspaceID: string, sessionID: string) {
    return readSessionState(sessionFile(workspaceID, sessionID))
  }

  export async function listSessionStates(workspaceID: string) {
    const rootDir = path.join(root(workspaceID), "sessions")
    const files = await Array.fromAsync(
      new Bun.Glob("*/session.json").scan({
        cwd: rootDir,
        absolute: true,
        onlyFiles: true,
      }),
    ).catch(() => [] as string[])
    const result = await Promise.all(files.map(readSessionState))
    return result.filter((item): item is SessionState => !!item)
  }

  export async function removeSessionState(workspaceID: string, sessionID: string) {
    await fs.rm(sessionDirectory(workspaceID, sessionID), {
      recursive: true,
      force: true,
    })
  }

  export async function allSessionStates() {
    const files = await Array.fromAsync(
      new Bun.Glob("**/session.json").scan({
        cwd: base(),
        absolute: true,
        onlyFiles: true,
      }),
    ).catch(() => [] as string[])
    const result = await Promise.all(files.map(readSessionState))
    return result.filter((item): item is SessionState => !!item)
  }

  export async function fromDirectory(directory: string) {
    const absolute = path.resolve(directory)
    let current = absolute
    while (true) {
      const workspaceJson = path.join(current, "workspace.json")
      if (await Filesystem.exists(workspaceJson)) {
        const workspace = await Bun.file(workspaceJson)
          .json()
          .then((x) => Info.parse(x))
        const states = await listSessionStates(workspace.id)
        const session = states.find((item) => Filesystem.contains(item.directory, absolute))
        const root = session?.roots.find((item) => Filesystem.contains(item.sessionWorktreeDirectory, absolute))
        return {
          workspace,
          session,
          root,
        }
      }
      const parent = path.dirname(current)
      if (parent === current) return
      current = parent
    }
  }

  export async function primaryProject(input: { workspace: Info; session?: SessionState }) {
    const source =
      input.session?.roots.find((item) => item.primary)?.sessionWorktreeDirectory ??
      input.workspace.projects.find((item) => item.primary)?.sourceDirectory
    if (!source) {
      throw new MissingPrimaryProjectError({ workspaceID: input.workspace.id })
    }
    return Project.fromDirectory(source).then((x) => x.project)
  }

  export async function touch(workspaceID: string) {
    const info = await read(workspaceID)
    await write({
      ...info,
      time: {
        ...info.time,
        updated: Date.now(),
      },
    })
  }

  export function asProject(input: Info) {
    return {
      id: input.id,
      worktree: input.directory,
      name: input.name,
      description: input.projects.map((item) => item.name ?? path.basename(item.sourceDirectory)).join(", "),
      vcs: "git" as const,
      group_ids: input.selected_group_ids,
      groups: input.selected_groups,
      sandboxes: [],
      time: input.time,
    }
  }
}
