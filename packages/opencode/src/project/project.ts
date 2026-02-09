import z from "zod"
import fs from "fs/promises"
import { Filesystem } from "../util/filesystem"
import path from "path"
import { $ } from "bun"
import { Storage } from "../storage/storage"
import { Log } from "../util/log"
import { Flag } from "@/flag/flag"
import { Session } from "../session"
import { work } from "../util/queue"
import { fn } from "@opencode-ai/util/fn"
import { BusEvent } from "@/bus/bus-event"
import { iife } from "@/util/iife"
import { GlobalBus } from "@/bus/global"
import { existsSync } from "fs"

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
      return User.current()?.id
    } catch (error) {
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

  export const Info = z
    .object({
      id: z.string(),
      worktree: z.string(),
      vcs: z.literal("git").optional(),
      name: z.string().optional(),
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

  export async function fromDirectory(directory: string) {
    log.info("fromDirectory", { directory })

    const { id, sandbox, worktree, vcs } = await iife(async () => {
      const matches = Filesystem.up({ targets: [".git"], start: directory })
      const git = await matches.next().then((x) => x.value)
      await matches.return()
      if (git) {
        let sandbox = path.dirname(git)

        const gitBinary = Bun.which("git")

        // cached id calculation
        let id = await Bun.file(path.join(git, "opencode"))
          .text()
          .then((x) => x.trim())
          .catch(() => undefined)

        if (!gitBinary) {
          return {
            id: id ?? "global",
            worktree: sandbox,
            sandbox: sandbox,
            vcs: Info.shape.vcs.parse(Flag.OPENCODE_FAKE_VCS),
          }
        }

        // generate id from root commit
        if (!id) {
          const roots = await $`git rev-list --max-parents=0 --all`
            .quiet()
            .nothrow()
            .cwd(sandbox)
            .text()
            .then((x) =>
              x
                .split("\n")
                .filter(Boolean)
                .map((x) => x.trim())
                .toSorted(),
            )
            .catch(() => undefined)

          if (!roots) {
            return {
              id: "global",
              worktree: sandbox,
              sandbox: sandbox,
              vcs: Info.shape.vcs.parse(Flag.OPENCODE_FAKE_VCS),
            }
          }

          id = roots[0]
          if (id) {
            void Bun.file(path.join(git, "opencode"))
              .write(id)
              .catch(() => undefined)
          }
        }

        if (!id) {
          return {
            id: "global",
            worktree: sandbox,
            sandbox: sandbox,
            vcs: "git",
          }
        }

        const top = await $`git rev-parse --show-toplevel`
          .quiet()
          .nothrow()
          .cwd(sandbox)
          .text()
          .then((x) => path.resolve(sandbox, x.trim()))
          .catch(() => undefined)

        if (!top) {
          return {
            id,
            sandbox,
            worktree: sandbox,
            vcs: Info.shape.vcs.parse(Flag.OPENCODE_FAKE_VCS),
          }
        }

        sandbox = top

        const worktree = await $`git rev-parse --git-common-dir`
          .quiet()
          .nothrow()
          .cwd(sandbox)
          .text()
          .then((x) => {
            const dirname = path.dirname(x.trim())
            if (dirname === ".") return sandbox
            return dirname
          })
          .catch(() => undefined)

        if (!worktree) {
          return {
            id,
            sandbox,
            worktree: sandbox,
            vcs: Info.shape.vcs.parse(Flag.OPENCODE_FAKE_VCS),
          }
        }

        return {
          id,
          sandbox,
          worktree,
          vcs: "git",
        }
      }

      return {
        id: "global",
        worktree: "/",
        sandbox: "/",
        vcs: Info.shape.vcs.parse(Flag.OPENCODE_FAKE_VCS),
      }
    })

    const userID = currentUserID()
    const key = projectKey(id, userID)
    let existing = await Storage.read<Info>(key).catch(() => undefined)
    if (!existing) {
      existing = {
        id,
        worktree,
        vcs: vcs as Info["vcs"],
        sandboxes: [],
        time: {
          created: Date.now(),
          updated: Date.now(),
        },
      }
      if (id !== "global") {
        await migrateFromGlobal(id, worktree)
      }
    }

    // migrate old projects before sandboxes
    if (!existing.sandboxes) existing.sandboxes = []

    if (Flag.OPENCODE_EXPERIMENTAL_ICON_DISCOVERY) discover(existing)

    const result: Info = {
      ...existing,
      worktree,
      vcs: vcs as Info["vcs"],
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
    // In multi-user mode, require a user to be logged in
    if (isMultiUserMode()) {
      const userID = currentUserID()
      // #region agent log
      const logData = { isMultiUser: true, userID, hasUserID: !!userID }
      try {
        const file = Bun.file("/Users/ke/Documents/project2/opencode/opencode/.cursor/debug.log")
        const existing = await file.exists() ? await file.text() : ""
        await Bun.write(file, existing + JSON.stringify({ location: "project.ts:328", message: "Project.list called", data: logData, timestamp: Date.now(), runId: "debug", hypothesisId: "D" }) + "\n")
      } catch {}
      // #endregion
      if (!userID) {
        // No user logged in, return empty list
        // #region agent log
        try {
          const file = Bun.file("/Users/ke/Documents/project2/opencode/opencode/.cursor/debug.log")
          const existing = await file.exists() ? await file.text() : ""
          await Bun.write(file, existing + JSON.stringify({ location: "project.ts:336", message: "Project.list returning empty for unauthenticated user", data: {}, timestamp: Date.now(), runId: "debug", hypothesisId: "D" }) + "\n")
        } catch {}
        // #endregion
        return []
      }
      const prefix = projectListPrefix(userID)
      const keys = await Storage.list(prefix)
      const projects = await Promise.all(keys.map((x) => Storage.read<Info>(x).catch(() => undefined)))
      const filtered = projects
        .filter((p): p is Info => !!p)
        .map((project) => ({
          ...project,
          sandboxes: project.sandboxes?.filter((x) => existsSync(x)),
        }))
      // #region agent log
      try {
        const file = Bun.file("/Users/ke/Documents/project2/opencode/opencode/.cursor/debug.log")
        const existing = await file.exists() ? await file.text() : ""
        await Bun.write(file, existing + JSON.stringify({ location: "project.ts:350", message: "Project.list returning filtered projects", data: { userID, prefix, keysCount: keys.length, projectsCount: filtered.length }, timestamp: Date.now(), runId: "debug", hypothesisId: "D" }) + "\n")
      } catch {}
      // #endregion
      return filtered
    }
    // Single-user mode: return all projects
    const prefix = projectListPrefix()
    const keys = await Storage.list(prefix)
    const projects = await Promise.all(keys.map((x) => Storage.read<Info>(x).catch(() => undefined)))
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
      GlobalBus.emit("event", {
        payload: {
          type: Event.Updated.type,
          properties: result,
        },
      })
      return result
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
