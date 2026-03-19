import z from "zod"
import fs from "fs/promises"
import path from "path"
import { Storage } from "../storage/storage"
import { Log } from "../util/log"
import { Flag } from "@/flag/flag"
import { Session } from "../session"
import { work } from "../util/queue"
import { fn } from "@opencode-ai/util/fn"
import { BusEvent } from "@/bus/bus-event"
import { GlobalBus } from "@/bus/global"
import { existsSync } from "fs"
import { NamedError } from "@opencode-ai/util/error"
import { resolveDirectory } from "./resolve"
import { ProjectRegistry } from "./registry"
import { Global } from "@/global"

export namespace Project {
  const log = Log.create({ service: "project" })

  // Helper to check if multi-user mode is enabled
  function isMultiUserMode(): boolean {
    return Flag.OPENCODE_MULTI_USER === "true" || Flag.OPENCODE_MULTI_USER === "1"
  }

  // Get current user ID in multi-user mode (lazy import to avoid circular dependency)
  // Use a lazy getter pattern to avoid circular dependency with User module
  // User imports Bus, Bus imports Instance, Instance imports Project, creating a cycle
  function currentUserID(): string | undefined {
    if (!isMultiUserMode()) return undefined
    try {
      // Use require for synchronous lazy loading to break circular dependency
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { User } = require("../user")
      const user = User.current()
      return user?.id
    } catch {
      // If require fails (e.g., module not loaded yet), return undefined
      // This is safe because the function is only called when multi-user mode is enabled
      // and the User module should be available at runtime
      return undefined
    }
  }

  // Build storage key for project (handles multi-user mode)
  function projectKey(projectID: string, userID?: string): string[] {
    if (isMultiUserMode() && userID) {
      return ["user_project", userID, projectID]
    }
    return ["project", projectID]
  }

  // Build storage prefix for listing projects
  function projectListPrefix(userID?: string): string[] {
    if (isMultiUserMode() && userID) {
      return ["user_project", userID]
    }
    return ["project"]
  }

  function isManagedWorktree(directory: string, projectID: string) {
    const root = path.join(Global.Path.data, "worktree", projectID)
    return directory === root || directory.startsWith(root + path.sep)
  }

  export const Info = z
    .object({
      id: z.string(),
      worktree: z.string(),
      vcs: z.literal("git").optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      groups: z.array(z.string()).default([]),
      icon: z
        .object({
          url: z.string().optional(),
          override: z.string().optional(),
          color: z.string().optional(),
        })
        .optional(),
      commands: z
        .object({
          start: z.string().optional().describe("Startup script to run when creating a new workspace (worktree)"),
        })
        .optional(),
      time: z.object({
        created: z.number(),
        updated: z.number(),
        initialized: z.number().optional(),
      }),
      sandboxes: z.array(z.string()),
    })
    .meta({
      ref: "Project",
    })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Updated: BusEvent.define("project.updated", Info),
  }

  export const DirectoryAccessError = NamedError.create(
    "ProjectDirectoryAccessError",
    z.object({
      directory: z.string(),
    }),
  )

  function currentUserRole() {
    if (!isMultiUserMode()) return
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { User } = require("../user")
      return User.current()?.role as "admin" | "user" | undefined
    } catch {
      return
    }
  }

  async function loadUserProjects(userID: string) {
    const prefix = projectListPrefix(userID)
    const keys = await Storage.list(prefix)
    const projects = await Promise.all(keys.map((x) => Storage.read<Info>(x).then(Info.parse).catch(() => undefined)))
    return projects
      .filter((p): p is Info => !!p)
      .map((project) => ({
        ...project,
        sandboxes: project.sandboxes?.filter((x) => existsSync(x)),
      }))
  }

  function mergeRegistryProject(entry: ProjectRegistry.Info, userProject?: Info): Info {
    return {
      id: entry.project_id,
      worktree: entry.directory,
      vcs: entry.vcs ?? userProject?.vcs,
      name: entry.name ?? userProject?.name,
      description: entry.description ?? userProject?.description,
      groups: entry.groups,
      icon: userProject?.icon,
      commands: userProject?.commands,
      sandboxes: userProject?.sandboxes?.filter((x) => existsSync(x)) ?? [],
      time: {
        created: userProject?.time.created ?? entry.time.created,
        updated: Math.max(userProject?.time.updated ?? 0, entry.time.updated),
        initialized: userProject?.time.initialized,
      },
    }
  }

  export async function assertDirectoryAccess(directory: string) {
    using _ = log.time("assertDirectoryAccess", { directory })
    if (!isMultiUserMode()) return
    const userID = currentUserID()
    if (!userID) throw new DirectoryAccessError({ directory })
    if (currentUserRole() === "admin") return

    const resolved = await resolveDirectory(directory)
    const match = resolved.vcs === "git" && resolved.worktree !== "/" ? await ProjectRegistry.findByDirectory(resolved.worktree) : undefined
    if (resolved.vcs !== "git" || resolved.worktree === "/") {
      throw new DirectoryAccessError({ directory })
    }
    if (match) return

    if (isManagedWorktree(directory, resolved.id)) {
      const internal = await ProjectRegistry.findByProjectID(resolved.id)
      if (internal) return
    }

    throw new DirectoryAccessError({ directory })
  }

  export async function fromDirectory(directory: string) {
    using _ = log.time("fromDirectory", { directory })
    log.info("fromDirectory", { directory })
    await assertDirectoryAccess(directory)
    const { id, sandbox, worktree, vcs } = await resolveDirectory(directory)
    const registry = vcs === "git" ? await ProjectRegistry.findByDirectory(worktree) : undefined
    const registryByProject =
      vcs === "git" && !registry && isManagedWorktree(directory, id) ? await ProjectRegistry.findByProjectID(id) : undefined
    const canonicalWorktree = registry?.directory ?? registryByProject?.directory ?? worktree
    const canonicalName = registry?.name ?? registryByProject?.name
    const canonicalDescription = registry?.description ?? registryByProject?.description
    const canonicalGroups = registry?.groups ?? registryByProject?.groups ?? []

    const userID = currentUserID()
    const key = projectKey(id, userID)
    let existing = await Storage.read<Info>(key).then(Info.parse).catch(() => undefined)
    if (!existing) {
      existing = {
        id,
        worktree: canonicalWorktree,
        vcs: vcs as Info["vcs"],
        name: canonicalName,
        description: canonicalDescription,
        groups: canonicalGroups,
        sandboxes: [],
        time: {
          created: Date.now(),
          updated: Date.now(),
        },
      }
      if (id !== "global") {
        await migrateFromGlobal(id, canonicalWorktree)
      }
    }

    // migrate old projects before sandboxes
    if (!existing.sandboxes) existing.sandboxes = []

    if (Flag.OPENCODE_EXPERIMENTAL_ICON_DISCOVERY) discover(existing)

    const result: Info = {
      ...existing,
      worktree: canonicalWorktree,
      vcs: vcs as Info["vcs"],
      name: canonicalName ?? existing.name,
      description: canonicalDescription ?? existing.description,
      groups: canonicalGroups,
      time: {
        ...existing.time,
        updated: Date.now(),
      },
    }
    if (sandbox !== result.worktree && !result.sandboxes.includes(sandbox)) result.sandboxes.push(sandbox)
    result.sandboxes = result.sandboxes.filter((x) => existsSync(x))
    await Storage.write<Info>(key, result)
    GlobalBus.emit("event", {
      payload: {
        type: Event.Updated.type,
        properties: result,
      },
    })
    log.info("fromDirectory.resolved", {
      directory,
      id,
      sandbox,
      worktree: canonicalWorktree,
      vcs,
    })
    return { project: result, sandbox }
  }

  export async function discover(input: Info) {
    if (input.vcs !== "git") return
    if (input.icon?.override) return
    if (input.icon?.url) return
    const glob = new Bun.Glob("**/{favicon}.{ico,png,svg,jpg,jpeg,webp}")
    const matches = await Array.fromAsync(
      glob.scan({
        cwd: input.worktree,
        absolute: true,
        onlyFiles: true,
        followSymlinks: false,
        dot: false,
      }),
    )
    const shortest = matches.sort((a, b) => a.length - b.length)[0]
    if (!shortest) return
    const file = Bun.file(shortest)
    const buffer = await file.arrayBuffer()
    const base64 = Buffer.from(buffer).toString("base64")
    const mime = file.type || "image/png"
    const url = `data:${mime};base64,${base64}`
    await update({
      projectID: input.id,
      icon: {
        url,
      },
    })
    return
  }

  async function migrateFromGlobal(newProjectID: string, worktree: string) {
    const globalProject = await Storage.read<Info>(["project", "global"]).catch(() => undefined)
    if (!globalProject) return

    const globalSessions = await Storage.list(["session", "global"]).catch(() => [])
    if (globalSessions.length === 0) return

    log.info("migrating sessions from global", { newProjectID, worktree, count: globalSessions.length })

    await work(10, globalSessions, async (key) => {
      const sessionID = key[key.length - 1]
      const session = await Storage.read<Session.Info>(key).catch(() => undefined)
      if (!session) return
      if (session.directory && session.directory !== worktree) return

      session.projectID = newProjectID
      log.info("migrating session", { sessionID, from: "global", to: newProjectID })
      await Storage.write(["session", newProjectID, sessionID], session)
      await Storage.remove(key)
    }).catch((error) => {
      log.error("failed to migrate sessions from global to project", { error, projectId: newProjectID })
    })
  }

  export async function setInitialized(projectID: string) {
    const userID = currentUserID()
    const key = projectKey(projectID, userID)
    await Storage.update<Info>(key, (draft) => {
      draft.time.initialized = Date.now()
    })
  }

  export async function list() {
    if (isMultiUserMode()) {
      const userID = currentUserID()
      if (!userID) return []
      const role = currentUserRole()

      const userProjects = await loadUserProjects(userID)
      const registry = (await ProjectRegistry.list()).filter((entry) => ProjectRegistry.visibleTo(entry, { userID, role }))
      if (role === "admin") {
        const merged = new Map(userProjects.map((project) => [project.worktree, project]))
        for (const entry of registry) {
          merged.set(entry.directory, mergeRegistryProject(entry, merged.get(entry.directory)))
        }
        return [...merged.values()]
      }
      return registry.map((entry) => mergeRegistryProject(entry, userProjects.find((x) => x.worktree === entry.directory)))
    }

    const prefix = projectListPrefix()
    const keys = await Storage.list(prefix)
    const projects = await Promise.all(keys.map((x) => Storage.read<Info>(x).then(Info.parse).catch(() => undefined)))
    return projects
      .filter((p): p is Info => !!p)
      .map((project) => ({
        ...project,
        sandboxes: project.sandboxes?.filter((x) => existsSync(x)),
      }))
  }

  export const update = fn(
    z.object({
      projectID: z.string(),
      name: z.string().optional(),
      icon: Info.shape.icon.optional(),
      commands: Info.shape.commands.optional(),
    }),
    async (input) => {
      const userID = currentUserID()
      const key = projectKey(input.projectID, userID)
      const result = await Storage.update<Info>(key, (draft) => {
        draft.groups = draft.groups ?? []
        if (input.name !== undefined) draft.name = input.name
        if (input.icon !== undefined) {
          draft.icon = {
            ...draft.icon,
          }
          if (input.icon.url !== undefined) draft.icon.url = input.icon.url
          if (input.icon.override !== undefined) draft.icon.override = input.icon.override || undefined
          if (input.icon.color !== undefined) draft.icon.color = input.icon.color
        }

        if (input.commands?.start !== undefined) {
          const start = input.commands.start || undefined
          draft.commands = {
            ...(draft.commands ?? {}),
          }
          draft.commands.start = start
          if (!draft.commands.start) draft.commands = undefined
        }

        draft.time.updated = Date.now()
      })
      const parsed = Info.parse(result)
      GlobalBus.emit("event", {
        payload: {
          type: Event.Updated.type,
          properties: parsed,
        },
      })
      return parsed
    },
  )

  export async function sandboxes(projectID: string) {
    const userID = currentUserID()
    const key = projectKey(projectID, userID)
    const project = await Storage.read<Info>(key).catch(() => undefined)
    if (!project?.sandboxes) return []
    const valid: string[] = []
    for (const dir of project.sandboxes) {
      const stat = await fs.stat(dir).catch(() => undefined)
      if (stat?.isDirectory()) valid.push(dir)
    }
    return valid
  }

  export async function addSandbox(projectID: string, directory: string) {
    const userID = currentUserID()
    const key = projectKey(projectID, userID)
    const result = await Storage.update<Info>(key, (draft) => {
      const sandboxes = draft.sandboxes ?? []
      if (!sandboxes.includes(directory)) sandboxes.push(directory)
      draft.sandboxes = sandboxes
      draft.time.updated = Date.now()
    })
    GlobalBus.emit("event", {
      payload: {
        type: Event.Updated.type,
        properties: result,
      },
    })
    return result
  }

  export async function removeSandbox(projectID: string, directory: string) {
    const userID = currentUserID()
    const key = projectKey(projectID, userID)
    const result = await Storage.update<Info>(key, (draft) => {
      const sandboxes = draft.sandboxes ?? []
      draft.sandboxes = sandboxes.filter((sandbox) => sandbox !== directory)
      draft.time.updated = Date.now()
    })
    GlobalBus.emit("event", {
      payload: {
        type: Event.Updated.type,
        properties: result,
      },
    })
    return result
  }
}
