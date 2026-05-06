import fs from "fs/promises"
import path from "path"
import z from "zod"
import { Global } from "@/global"
import { ProjectRegistry } from "@/project/registry"
import { Session } from "@/session"
import { User } from "@/user"
import { Workspace } from "@/workspace"

export namespace StorageAdmin {
  export const Category = z.enum([
    "workspaces",
    "closedWorkspaces",
    "snapshots",
    "cache",
    "tmpUploads",
    "archivedSessions",
    "orphanWorkspaces",
    "orphanUserWorktrees",
    "danglingStorage",
  ])
  export type Category = z.infer<typeof Category>

  export const Risk = z.enum(["low", "medium", "high"])
  export type Risk = z.infer<typeof Risk>

  export const Item = z.object({
    id: z.string(),
    category: Category,
    label: z.string(),
    bytes: z.number(),
    risk: Risk,
    active: z.boolean(),
    reason: z.string(),
    paths: z.array(z.string()),
    metadata: z.record(z.string(), z.string()).default({}),
  })
  export type Item = z.infer<typeof Item>

  export const CategorySummary = z.object({
    category: Category,
    count: z.number(),
    bytes: z.number(),
    reclaimable: z.number(),
    high_risk: z.number(),
  })
  export type CategorySummary = z.infer<typeof CategorySummary>

  export const UserSummary = z.object({
    userID: z.string(),
    username: z.string().optional(),
    count: z.number(),
    bytes: z.number(),
    high_risk: z.number(),
  })
  export type UserSummary = z.infer<typeof UserSummary>

  export const Summary = z.object({
    scanned_at: z.number(),
    total_bytes: z.number(),
    reclaimable_bytes: z.number(),
    high_risk: z.number(),
    categories: z.array(CategorySummary),
    users: z.array(UserSummary),
    items: z.array(Item),
  })
  export type Summary = z.infer<typeof Summary>

  export const ScanInput = z.object({
    activeWorkspaceIDs: z.array(z.string()).optional(),
    activeSessionIDs: z.array(z.string()).optional(),
    userID: z.string().optional(),
  })
  export type ScanInput = z.input<typeof ScanInput>

  export const PlanInput = ScanInput.extend({
    categories: z.array(Category).optional(),
    force: z.boolean().default(false),
  })
  export type PlanInput = z.input<typeof PlanInput>

  export const Plan = z.object({
    scanned_at: z.number(),
    force: z.boolean(),
    total_bytes: z.number(),
    items: z.array(Item),
    skipped: z.array(Item),
  })
  export type Plan = z.infer<typeof Plan>

  export const CleanupResult = z.object({
    scanned_at: z.number(),
    force: z.boolean(),
    total_bytes: z.number(),
    removed: z.array(Item),
    skipped: z.array(Item),
    failed: z.array(
      z.object({
        item: Item,
        error: z.string(),
      }),
    ),
  })
  export type CleanupResult = z.infer<typeof CleanupResult>

  type Roots = {
    data: string
    cache: string
  }

  export type Options = {
    roots?: Roots
    activeWorkspaceIDs?: string[]
    activeSessionIDs?: string[]
  }

  const defaultRoots = () => ({
    data: Global.Path.data,
    cache: Global.Path.cache,
  })

  function roots(input?: Options) {
    return input?.roots ?? defaultRoots()
  }

  function storageRoot(input: Roots) {
    return path.join(input.data, "storage")
  }

  function workspaceRoot(input: Roots) {
    return path.join(input.data, "workspace")
  }

  function userWorktreeRoot(input: Roots) {
    return path.join(input.data, "user-worktree")
  }

  function snapshotRoot(input: Roots) {
    return path.join(input.data, "snapshot")
  }

  function id(category: Category, key: string) {
    return `${category}:${key}`
  }

  function safe(root: string, target: string) {
    const base = path.resolve(root)
    const resolved = path.resolve(target)
    return resolved === base || resolved.startsWith(base + path.sep)
  }

  async function size(target: string): Promise<number> {
    const stat = await fs.lstat(target).catch(() => undefined)
    if (!stat) return 0
    if (!stat.isDirectory()) return stat.size
    if (stat.isSymbolicLink()) return stat.size
    const entries = await fs.readdir(target, { withFileTypes: true }).catch(() => [])
    const sizes = await Promise.all(entries.map((entry) => size(path.join(target, entry.name))))
    return sizes.reduce((sum, item) => sum + item, 0)
  }

  async function directories(target: string) {
    return fs
      .readdir(target, { withFileTypes: true })
      .then((items) => items.filter((item) => item.isDirectory()).map((item) => path.join(target, item.name)))
      .catch(() => [] as string[])
  }

  async function files(target: string, pattern: string) {
    return Array.fromAsync(
      new Bun.Glob(pattern).scan({
        cwd: target,
        absolute: true,
        onlyFiles: true,
      }),
    ).catch(() => [] as string[])
  }

  async function sessions(input: Roots) {
    const items = await files(path.join(storageRoot(input), "session"), "*/*.json")
    const result = await Promise.all(
      items.map(async (item) => ({
        file: item,
        session: await Bun.file(item)
          .json()
          .then((value) => Session.Info.parse(value))
          .catch(() => undefined),
      })),
    )
    return result.filter((item): item is { file: string; session: Session.Info } => !!item.session)
  }

  async function userMap(input: Roots) {
    const items = await files(path.join(storageRoot(input), "user"), "*.json")
    const result = await Promise.all(
      items.map((item) =>
        Bun.file(item)
          .json()
          .then((value) => User.PublicInfo.parse(value))
          .catch(() => undefined),
      ),
    )
    return new Map(result.filter((item): item is User.PublicInfo => !!item).map((item) => [item.id, item]))
  }

  async function projects(input: Roots) {
    const items = await files(path.join(storageRoot(input), "project_registry"), "*.json")
    const result = await Promise.all(
      items.map((item) =>
        Bun.file(item)
          .json()
          .then((value) => ProjectRegistry.Info.parse(value))
          .catch(() => undefined),
      ),
    )
    return new Set(result.filter((item): item is ProjectRegistry.Info => !!item).map((item) => item.project_id))
  }

  async function workspaces(input: Roots) {
    const items = await files(workspaceRoot(input), "*/*/workspace.json")
    const result = await Promise.all(
      items.map(async (item) => ({
        file: item,
        owner: path.basename(path.dirname(path.dirname(item))),
        dir: path.dirname(item),
        workspace: await Bun.file(item)
          .json()
          .then((value) => Workspace.Info.parse(value))
          .catch(() => undefined),
      })),
    )
    return result
  }

  async function cache(input: Roots): Promise<Item[]> {
    const bytes = await size(input.cache)
    if (!bytes) return []
    return [
      {
        id: id("cache", input.cache),
        category: "cache",
        label: "Global cache",
        bytes,
        risk: "low",
        active: false,
        reason: "Cache files can be rebuilt by opencode.",
        paths: [input.cache],
        metadata: { owner: "__global__" },
      },
    ]
  }

  function present<T>(input: T | undefined): input is T {
    return !!input
  }

  async function tmpUploads(all: Awaited<ReturnType<typeof sessions>>): Promise<Item[]> {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    const dirs = (
      await Promise.all(
        all.map(async (item) =>
          (await directories(path.join(item.session.directory, ".tmp", "uploads"))).map((dir) => ({
            dir,
            session: item.session,
          })),
        ),
      )
    ).flat()
    const items = await Promise.all(
      dirs.map(async (item): Promise<Item | undefined> => {
        const state = await Bun.file(path.join(item.dir, "state.json"))
          .json()
          .catch(() => undefined)
        const created = typeof state?.createdAt === "number" ? state.createdAt : undefined
        if (created && created >= cutoff) return
        return {
          id: id("tmpUploads", item.dir),
          category: "tmpUploads" as const,
          label: path.basename(item.dir),
          bytes: await size(item.dir),
          risk: "low" as const,
          active: false,
          reason: created ? "Upload is older than 24 hours." : "Upload state is missing or invalid.",
          paths: [item.dir],
          metadata: {
            ...(created ? { created: String(created) } : {}),
            userID: item.session.userID ?? "__local__",
            workspaceID: item.session.workspaceID,
            sessionID: item.session.id,
          },
        }
      }),
    )
    return items.filter(present)
  }

  async function archivedSessions(input: Roots, all: Awaited<ReturnType<typeof sessions>>): Promise<Item[]> {
    const items = await Promise.all(
      all
        .filter((item) => !!item.session.time.archived)
        .map(async (item) => {
          const message = path.join(storageRoot(input), "message", item.session.id)
          const messages = await files(message, "*.json")
          const parts = (
            await Promise.all(
              messages.map((message) =>
                files(path.join(storageRoot(input), "part", path.basename(message, ".json")), "*.json"),
              ),
            )
          ).flat()
          const snapshot = path.join(snapshotRoot(input), item.session.id)
          const paths = [item.file, item.session.directory, message, snapshot, ...parts]
          const bytes = await Promise.all(paths.map(size)).then((items) => items.reduce((sum, item) => sum + item, 0))
          return {
            id: id("archivedSessions", item.session.id),
            category: "archivedSessions" as const,
            label: item.session.title,
            bytes,
            risk: "high" as const,
            active: true,
            reason: "Archived sessions contain conversation history and worktree state.",
            paths,
            metadata: {
              sessionID: item.session.id,
              workspaceID: item.session.workspaceID,
              projectID: item.session.projectID,
              userID: item.session.userID ?? "__local__",
              updated: String(item.session.time.updated),
              archived: String(item.session.time.archived),
            },
          }
        }),
    )
    return items
  }

  async function orphanWorkspaces(
    input: Roots,
    knownUsers: Set<string>,
    all: Awaited<ReturnType<typeof workspaces>>,
  ): Promise<Item[]> {
    const special = new Set(["__local__", "__anonymous__"])
    const items = await Promise.all(
      all.map(async (item): Promise<Item | undefined> => {
        const orphanOwner = !special.has(item.owner) && !knownUsers.has(item.owner)
        const invalid = !item.workspace
        const mismatch = !!item.workspace?.userID && item.workspace.userID !== item.owner
        if (!orphanOwner && !invalid && !mismatch) return
        return {
          id: id("orphanWorkspaces", item.dir),
          category: "orphanWorkspaces" as const,
          label: item.workspace?.name ?? path.basename(item.dir),
          bytes: await size(item.dir),
          risk: "medium" as const,
          active: false,
          reason: invalid
            ? "Workspace metadata is invalid."
            : orphanOwner
              ? "Workspace owner no longer exists."
              : "Workspace owner does not match its directory bucket.",
          paths: [item.dir],
          metadata: {
            owner: item.owner,
            userID: item.owner,
            workspaceID: item.workspace?.id ?? path.basename(item.dir),
          },
        }
      }),
    )
    return items.filter(present)
  }

  function sessionsByWorkspace(all: Awaited<ReturnType<typeof sessions>>) {
    const result = new Map<string, Session.Info[]>()
    for (const item of all) {
      const existing = result.get(item.session.workspaceID)
      if (existing) {
        existing.push(item.session)
        continue
      }
      result.set(item.session.workspaceID, [item.session])
    }
    return result
  }

  async function workspaceUsage(
    all: Awaited<ReturnType<typeof workspaces>>,
    orphans: Item[],
    sessions: Map<string, Session.Info[]>,
    activeWorkspaceIDs?: Set<string>,
  ): Promise<Item[]> {
    const orphanPaths = new Set(orphans.flatMap((item) => item.paths))
    const items = await Promise.all(
      all
        .filter((item) => {
          if (!item.workspace) return false
          if (orphanPaths.has(item.dir)) return false
          if (activeWorkspaceIDs) return activeWorkspaceIDs.has(item.workspace.id)
          return (sessions.get(item.workspace.id) ?? []).some((session) => !session.time.archived)
        })
        .map(
          async (item): Promise<Item> => ({
            id: id("workspaces", item.dir),
            category: "workspaces",
            label: item.workspace?.name ?? path.basename(item.dir),
            bytes: await size(item.dir),
            risk: "high",
            active: true,
            reason: "Workspace is owned by an existing user and is shown for visibility only.",
            paths: [item.dir],
            metadata: {
              owner: item.owner,
              userID: item.workspace?.userID ?? item.owner,
              workspaceID: item.workspace?.id ?? path.basename(item.dir),
            },
          }),
        ),
    )
    return items
  }

  async function closedWorkspaces(
    input: Roots,
    all: Awaited<ReturnType<typeof workspaces>>,
    orphans: Item[],
    sessions: Map<string, Session.Info[]>,
    activeWorkspaceIDs?: Set<string>,
  ): Promise<Item[]> {
    const orphanPaths = new Set(orphans.flatMap((item) => item.paths))
    const items = await Promise.all(
      all
        .filter((item) => {
          if (!item.workspace) return false
          if (orphanPaths.has(item.dir)) return false
          if (activeWorkspaceIDs) return !activeWorkspaceIDs.has(item.workspace.id)
          return !(sessions.get(item.workspace.id) ?? []).some((session) => !session.time.archived)
        })
        .map(
          async (item): Promise<Item> => ({
            id: id("closedWorkspaces", item.dir),
            category: "closedWorkspaces",
            label: item.workspace?.name ?? path.basename(item.dir),
            bytes: await size(item.dir),
            risk: "medium",
            active: false,
            reason: "Workspace has no unarchived sessions and can be reclaimed.",
            paths: [
              item.dir,
              path.join(storageRoot(input), "session", item.workspace?.id ?? path.basename(item.dir)),
              path.join(snapshotRoot(input), item.workspace?.id ?? path.basename(item.dir)),
            ],
            metadata: {
              owner: item.owner,
              userID: item.workspace?.userID ?? item.owner,
              workspaceID: item.workspace?.id ?? path.basename(item.dir),
            },
          }),
        ),
    )
    return items
  }

  async function orphanUserWorktrees(
    input: Roots,
    knownUsers: Set<string>,
    knownProjects: Set<string>,
  ): Promise<Item[]> {
    const projectDirs = await directories(userWorktreeRoot(input))
    const userDirs = (
      await Promise.all(
        projectDirs.map(async (project) =>
          (await directories(project)).map((user) => ({
            projectID: path.basename(project),
            userID: path.basename(user),
            dir: user,
          })),
        ),
      )
    ).flat()
    const items = await Promise.all(
      userDirs.map(async (item): Promise<Item | undefined> => {
        if (knownUsers.has(item.userID) && knownProjects.has(item.projectID)) return
        return {
          id: id("orphanUserWorktrees", item.dir),
          category: "orphanUserWorktrees" as const,
          label: `${item.projectID}/${item.userID}`,
          bytes: await size(item.dir),
          risk: "medium" as const,
          active: false,
          reason: knownUsers.has(item.userID) ? "Project no longer exists." : "User no longer exists.",
          paths: [item.dir],
          metadata: {
            projectID: item.projectID,
            userID: item.userID,
            owner: item.userID,
          },
        }
      }),
    )
    return items.filter(present)
  }

  async function danglingStorage(
    input: Roots,
    knownWorkspaces: Set<string>,
    knownSessions: Set<string>,
    all: Awaited<ReturnType<typeof sessions>>,
  ): Promise<Item[]> {
    const sessionRoot = path.join(storageRoot(input), "session")
    const workspaceDirs = await directories(sessionRoot)
    const missingWorkspace = await Promise.all(
      workspaceDirs
        .filter((dir) => !knownWorkspaces.has(path.basename(dir)))
        .map(
          async (dir): Promise<Item> => ({
            id: id("danglingStorage", dir),
            category: "danglingStorage" as const,
            label: path.basename(dir),
            bytes: await size(dir),
            risk: "medium" as const,
            active: false,
            reason: "Session storage belongs to a workspace that no longer exists.",
            paths: [dir],
            metadata: {
              workspaceID: path.basename(dir),
              owner: "__unknown__",
            },
          }),
        ),
    )
    const invalid = await Promise.all(
      (await files(sessionRoot, "*/*.json"))
        .filter((file) => !all.some((item) => item.file === file) || !knownSessions.has(path.basename(file, ".json")))
        .map(
          async (file): Promise<Item> => ({
            id: id("danglingStorage", file),
            category: "danglingStorage" as const,
            label: path.basename(file),
            bytes: await size(file),
            risk: "medium" as const,
            active: false,
            reason: "Session metadata is missing or invalid.",
            paths: [file],
            metadata: {
              workspaceID: path.basename(path.dirname(file)),
              sessionID: path.basename(file, ".json"),
              owner: "__unknown__",
            },
          }),
        ),
    )
    return [...missingWorkspace, ...invalid]
  }

  async function snapshots(
    input: Roots,
    allSessions: Awaited<ReturnType<typeof sessions>>,
    allWorkspaces: Awaited<ReturnType<typeof workspaces>>,
    activeWorkspaceIDs?: Set<string>,
    activeSessionIDs?: Set<string>,
  ): Promise<Item[]> {
    const dirs = await directories(snapshotRoot(input))
    const sessions = new Map(allSessions.map((item) => [item.session.id, item.session]))
    const workspaces = new Map(
      allWorkspaces.flatMap((item) =>
        item.workspace
          ? [
              [
                item.workspace.id,
                {
                  workspace: item.workspace,
                  owner: item.owner,
                },
              ] as const,
            ]
          : [],
      ),
    )
    const keep = new Set([...(activeWorkspaceIDs ?? []), ...(activeSessionIDs ?? [])])
    const items = await Promise.all(
      dirs
        .filter((dir) => !keep.has(path.basename(dir)))
        .map(async (dir): Promise<Item> => {
          const scope = path.basename(dir)
          const session = sessions.get(scope)
          const workspace = workspaces.get(scope)
          return {
            id: id("snapshots", dir),
            category: "snapshots",
            label: scope,
            bytes: await size(dir),
            risk: "medium",
            active: false,
            reason: "Snapshot no longer belongs to a workspace or conversation visible in the UI.",
            paths: [dir],
            metadata: {
              owner: session?.userID ?? workspace?.workspace.userID ?? workspace?.owner ?? "__unknown__",
              userID: session?.userID ?? workspace?.workspace.userID ?? workspace?.owner ?? "__unknown__",
              scope,
              ...(session ? { sessionID: session.id, workspaceID: session.workspaceID } : {}),
              ...(workspace ? { workspaceID: workspace.workspace.id } : {}),
            },
          }
        }),
    )
    return items
  }

  async function items(input?: Options): Promise<Item[]> {
    const root = roots(input)
    const [allSessions, knownUserMap, knownProjects, allWorkspaces, cacheItems] = await Promise.all([
      sessions(root),
      userMap(root),
      projects(root),
      workspaces(root),
      cache(root),
    ])
    const knownUsers = new Set(knownUserMap.keys())
    const knownWorkspaces = new Set(allWorkspaces.flatMap((item) => (item.workspace ? [item.workspace.id] : [])))
    const knownSessions = new Set(allSessions.map((item) => item.session.id))
    const orphanWorkspaceItems = await orphanWorkspaces(root, knownUsers, allWorkspaces)
    const byWorkspace = sessionsByWorkspace(allSessions)
    const activeWorkspaceIDs = input?.activeWorkspaceIDs ? new Set(input.activeWorkspaceIDs) : undefined
    const activeSessionIDs = input?.activeSessionIDs ? new Set(input.activeSessionIDs) : undefined
    const groups: Item[][] = await Promise.all([
      workspaceUsage(allWorkspaces, orphanWorkspaceItems, byWorkspace, activeWorkspaceIDs),
      closedWorkspaces(root, allWorkspaces, orphanWorkspaceItems, byWorkspace, activeWorkspaceIDs),
      snapshots(root, allSessions, allWorkspaces, activeWorkspaceIDs, activeSessionIDs),
      Promise.resolve(cacheItems),
      tmpUploads(allSessions),
      archivedSessions(root, allSessions),
      Promise.resolve(orphanWorkspaceItems),
      orphanUserWorktrees(root, knownUsers, knownProjects),
      danglingStorage(root, knownWorkspaces, knownSessions, allSessions),
    ])
    return groups.flat().toSorted((a, b) => b.bytes - a.bytes)
  }

  function owner(item: Item) {
    return item.metadata.userID ?? item.metadata.owner ?? "__unknown__"
  }

  function filterUser(input: Item[], userID?: string) {
    if (!userID) return input
    return input.filter((item) => owner(item) === userID)
  }

  export async function summary(input: ScanInput = {}, options?: Options): Promise<Summary> {
    const parsed = ScanInput.parse(input)
    const scanned = Date.now()
    const root = roots(options)
    const [allItems, registered] = await Promise.all([
      items({ roots: root, activeWorkspaceIDs: parsed.activeWorkspaceIDs, activeSessionIDs: parsed.activeSessionIDs }),
      userMap(root),
    ])
    const all = filterUser(allItems, parsed.userID)
    const categories = Category.options.map((category) => {
      const filtered = all.filter((item) => item.category === category)
      return {
        category,
        count: filtered.length,
        bytes: filtered.reduce((sum, item) => sum + item.bytes, 0),
        reclaimable: filtered.filter((item) => item.risk !== "high").reduce((sum, item) => sum + item.bytes, 0),
        high_risk: filtered.filter((item) => item.risk === "high").length,
      } satisfies CategorySummary
    })
    const users = new Map<string, UserSummary>(
      Array.from(registered.values()).map((user) => [
        user.id,
        {
          userID: user.id,
          username: user.username,
          count: 0,
          bytes: 0,
          high_risk: 0,
        },
      ]),
    )
    for (const item of all) {
      const userID = owner(item)
      const current = users.get(userID) ?? {
        userID,
        username: userID === "__global__" ? "Global" : userID === "__unknown__" ? "Unknown" : undefined,
        count: 0,
        bytes: 0,
        high_risk: 0,
      }
      current.count++
      current.bytes += item.bytes
      if (item.risk === "high") current.high_risk++
      users.set(userID, current)
    }
    return {
      scanned_at: scanned,
      total_bytes: all.reduce((sum, item) => sum + item.bytes, 0),
      reclaimable_bytes: all.filter((item) => item.risk !== "high").reduce((sum, item) => sum + item.bytes, 0),
      high_risk: all.filter((item) => item.risk === "high").length,
      categories,
      users: Array.from(users.values()).toSorted((a, b) => b.bytes - a.bytes),
      items: all.slice(0, 100),
    }
  }

  export async function plan(input: PlanInput = {}, options?: Options): Promise<Plan> {
    const parsed = PlanInput.parse(input)
    const categories = new Set(parsed.categories ?? Category.options)
    const selected = filterUser(
      await items({
        ...options,
        activeWorkspaceIDs: parsed.activeWorkspaceIDs,
        activeSessionIDs: parsed.activeSessionIDs,
      }),
      parsed.userID,
    ).filter((item) => {
      if (item.category === "workspaces") return false
      return categories.has(item.category)
    })
    const removable = selected.filter((item) => parsed.force || item.risk !== "high")
    const skipped = selected.filter((item) => !parsed.force && item.risk === "high")
    return {
      scanned_at: Date.now(),
      force: parsed.force,
      total_bytes: removable.reduce((sum, item) => sum + item.bytes, 0),
      items: removable,
      skipped,
    }
  }

  async function remove(root: Roots, item: Item) {
    if (item.category === "archivedSessions") {
      const sessionID = item.metadata.sessionID
      if (!sessionID) return
      if (root.data === Global.Path.data && root.cache === Global.Path.cache) {
        await Session.remove(sessionID)
        return
      }
    }
    if (item.category === "cache") {
      const entries = await fs.readdir(root.cache).catch(() => [] as string[])
      await Promise.all(entries.map((entry) => fs.rm(path.join(root.cache, entry), { recursive: true, force: true })))
      await fs.mkdir(root.cache, { recursive: true })
      return
    }
    if (item.category === "closedWorkspaces") {
      const workspaceID = item.metadata.workspaceID
      if (workspaceID && root.data === Global.Path.data && root.cache === Global.Path.cache) {
        for (const entry of await sessions(root)) {
          if (entry.session.workspaceID !== workspaceID) continue
          await Session.remove(entry.session.id)
        }
      }
      if (workspaceID) {
        await fs.rm(path.join(storageRoot(root), "session", workspaceID), { recursive: true, force: true })
      }
    }
    await Promise.all(
      item.paths.map(async (target) => {
        if (!safe(root.data, target) && !safe(root.cache, target)) return
        await fs.rm(target, { recursive: true, force: true })
      }),
    )
  }

  export async function cleanup(input: PlanInput = {}, options?: Options): Promise<CleanupResult> {
    const root = roots(options)
    const next = await plan(input, options)
    const results = await Promise.all(
      next.items.map(async (item) => {
        const before = await Promise.all(item.paths.map(size)).then((items) =>
          items.reduce((sum, item) => sum + item, 0),
        )
        const error = await remove(root, item)
          .then(() => undefined)
          .catch((e) => (e instanceof Error ? e.message : String(e)))
        if (error) return { item, error }
        const after = await Promise.all(item.paths.map(size)).then((items) =>
          items.reduce((sum, item) => sum + item, 0),
        )
        return {
          item: {
            ...item,
            bytes: Math.max(0, before - after),
          },
        }
      }),
    )
    return {
      scanned_at: Date.now(),
      force: next.force,
      total_bytes: results
        .filter((item): item is { item: Item } => !("error" in item))
        .reduce((sum, item) => sum + item.item.bytes, 0),
      removed: results.filter((item): item is { item: Item } => !("error" in item)).map((item) => item.item),
      skipped: next.skipped,
      failed: results.filter((item): item is { item: Item; error: string } => "error" in item),
    }
  }
}
