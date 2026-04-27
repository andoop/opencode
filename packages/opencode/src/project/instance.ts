import { Log } from "@/util/log"
import path from "path"
import { Context } from "../util/context"
import { Project } from "./project"
import { State } from "./state"
import { iife } from "@/util/iife"
import { GlobalBus } from "@/bus/global"
import { Filesystem } from "@/util/filesystem"
import type { Workspace } from "@/workspace"

interface Context {
  directory: string
  worktree: string
  project: Project.Info
  workspace?: Workspace.Info
  session?: Workspace.SessionState
  roots?: Workspace.SessionRoot[]
}
const context = Context.create<Context>("instance")
const cache = new Map<string, Promise<Context>>()

const disposal = {
  all: undefined as Promise<void> | undefined,
}

// Lazy import to avoid circular dependency
const getUserContext = async () => {
  const { User } = await import("@/user")
  return User.current()
}

const getUserWorktree = async (projectID: string, sandbox: string) => {
  const { UserWorktree } = await import("@/worktree/user-worktree")
  return UserWorktree.getOrCreate(projectID, sandbox)
}

const getWorkspace = async () => {
  const mod = await import("@/workspace")
  return mod.Workspace
}

export const Instance = {
  async provide<R>(input: { directory: string; init?: () => Promise<any>; fn: () => R }): Promise<R> {
    // In multi-user mode, use user-specific cache key
    const user = await getUserContext()
    const cacheKey = user ? `${input.directory}:${user.id}` : input.directory

    let existing = cache.get(cacheKey)
    if (!existing) {
      Log.Default.info("creating instance", { directory: input.directory, userID: user?.id })
      existing = iife(async () => {
        const Workspace = await getWorkspace()
        const scoped = await Workspace.fromDirectory(input.directory)
        if (scoped) {
          const project = await Workspace.primaryProject(scoped)
          const root =
            scoped.session?.roots.find((item) => item.primary)?.sessionWorktreeDirectory ??
            scoped.workspace.projects.find((item) => item.primary)?.sourceDirectory ??
            project.worktree
          const ctx = {
            directory: input.directory,
            worktree: root,
            project,
            workspace: scoped.workspace,
            session: scoped.session,
            roots: scoped.session?.roots,
          }
          await context.provide(ctx, async () => {
            await input.init?.()
          })
          return ctx
        }
        const { project, sandbox } = await Project.fromDirectory(input.directory)

        // In multi-user mode, get or create a user-specific worktree
        const worktree = await getUserWorktree(project.id, sandbox)

        const ctx = {
          directory: input.directory,
          worktree,
          project,
          roots: undefined,
        }
        await context.provide(ctx, async () => {
          await input.init?.()
        })
        return ctx
      })
      cache.set(cacheKey, existing)
    }
    const ctx = await existing
    return context.provide(ctx, async () => {
      return input.fn()
    })
  },
  get directory() {
    return context.use().directory
  },
  get worktree() {
    return context.use().worktree
  },
  get project() {
    return context.use().project
  },
  get workspace() {
    return context.use().workspace
  },
  get session() {
    return context.use().session
  },
  get roots() {
    return context.use().roots
  },
  /**
   * Check if a path is within the project boundary.
   * Returns true if path is inside Instance.directory OR Instance.worktree.
   * Paths within the worktree but outside the working directory should not trigger external_directory permission.
   */
  containsPath(filepath: string) {
    if (Filesystem.contains(Instance.directory, filepath)) return true
    const session = Instance.session
    if (session && Filesystem.contains(path.join(session.directory, ".tmp"), filepath)) return true
    if (Instance.roots?.some((item) => Filesystem.contains(item.sessionWorktreeDirectory, filepath))) return true
    // Non-git projects set worktree to "/" which would match ANY absolute path.
    // Skip worktree check in this case to preserve external_directory permissions.
    if (Instance.worktree === "/") return false
    return Filesystem.contains(Instance.worktree, filepath)
  },
  rootForPath(filepath: string) {
    const roots = Instance.roots
    if (!roots?.length) return
    return roots.find((item) => Filesystem.contains(item.sessionWorktreeDirectory, filepath))
  },
  state<S>(init: () => S, dispose?: (state: Awaited<S>) => Promise<void>): () => S {
    return State.create(() => Instance.directory, init, dispose)
  },
  async dispose() {
    const user = await getUserContext()
    const cacheKey = user ? `${Instance.directory}:${user.id}` : Instance.directory
    Log.Default.info("disposing instance", { directory: Instance.directory, userID: user?.id })
    await State.dispose(Instance.directory)
    cache.delete(cacheKey)
    GlobalBus.emit("event", {
      directory: Instance.directory,
      payload: {
        type: "server.instance.disposed",
        properties: {
          directory: Instance.directory,
        },
      },
    })
  },
  async disposeAll() {
    if (disposal.all) return disposal.all

    disposal.all = iife(async () => {
      Log.Default.info("disposing all instances")
      const entries = [...cache.entries()]
      for (const [key, value] of entries) {
        if (cache.get(key) !== value) continue

        const ctx = await value.catch((error) => {
          Log.Default.warn("instance dispose failed", { key, error })
          return undefined
        })

        if (!ctx) {
          if (cache.get(key) === value) cache.delete(key)
          continue
        }

        if (cache.get(key) !== value) continue

        await context.provide(ctx, async () => {
          await Instance.dispose()
        })
      }
    }).finally(() => {
      disposal.all = undefined
    })

    return disposal.all
  },
}
