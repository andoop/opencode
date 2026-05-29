import { GlobalBus } from "@/bus/global"
import { Storage } from "@/storage/storage"
import { Log } from "@/util/log"
import { Filesystem } from "@/util/filesystem"
import { NamedError } from "@opencode-ai/util/error"
import z from "zod"
import { GroupRegistry } from "./group-registry"
import { resolveDirectory } from "./resolve"

export namespace ProjectRegistry {
  const log = Log.create({ service: "project.registry" })
  const VisibilityMode = z.enum(["all", "include", "exclude"])
  const Visibility = z.object({
    mode: VisibilityMode.default("all"),
    user_ids: z.array(z.string()).default([]),
  })
  export type Visibility = z.infer<typeof Visibility>

  export function normalizeGroups(input?: string[]) {
    return Array.from(new Set((input ?? []).map((item) => item.trim()).filter(Boolean))).toSorted((a, b) =>
      a.localeCompare(b),
    )
  }

  export function normalizeVisibility(input?: Partial<Visibility>) {
    return Visibility.parse({
      mode: input?.mode ?? "all",
      user_ids: Array.from(new Set((input?.user_ids ?? []).map((item) => item.trim()).filter(Boolean))).toSorted(
        (a, b) => a.localeCompare(b),
      ),
    })
  }

  export function visibleTo(info: Info, input?: { userID?: string; role?: "admin" | "user" }) {
    if (input?.role === "admin") return true
    if (info.visibility.mode === "all") return true
    if (!input?.userID) return false
    if (info.visibility.mode === "include") return info.visibility.user_ids.includes(input.userID)
    return !info.visibility.user_ids.includes(input.userID)
  }

  export const Info = z
    .object({
      id: z.string(),
      project_id: z.string(),
      directory: z.string(),
      directory_exists: z.boolean().optional(),
      name: z.string().optional(),
      description: z.string().optional(),
      profile_markdown: z.string().optional(),
      group_ids: z.array(z.string()).default([]),
      groups: z.array(z.string()).default([]),
      visibility: Visibility.default({ mode: "all", user_ids: [] }),
      created_by: z.string().optional(),
      vcs: z.literal("git").optional(),
      time: z.object({
        created: z.number(),
        updated: z.number(),
      }),
    })
    .meta({ ref: "ProjectRegistry" })
  export type Info = z.infer<typeof Info>

  export const DuplicateError = NamedError.create(
    "ProjectRegistryDuplicateError",
    z.object({
      directory: z.string(),
    }),
  )

  export const InvalidDirectoryError = NamedError.create(
    "ProjectRegistryInvalidDirectoryError",
    z.object({
      directory: z.string(),
      message: z.string(),
    }),
  )

  function key(id: string) {
    return ["project_registry", id]
  }

  async function publishUpdated(info: Info) {
    GlobalBus.emit("event", {
      directory: "global",
      payload: {
        type: "global.disposed",
        properties: {},
      },
    })
  }

  export async function list() {
    const keys = await Storage.list(["project_registry"])
    const items = await Promise.all(
      keys.map((x) =>
        Storage.read<Info>(x)
          .then(Info.parse)
          .then(hydrate)
          .catch(() => undefined),
      ),
    )
    return items
      .filter((x): x is Info => !!x)
      .sort((a, b) => (a.name ?? a.directory).localeCompare(b.name ?? b.directory))
  }

  export async function get(id: string) {
    return Storage.read<Info>(key(id)).then(Info.parse).then(hydrate)
  }
  async function hydrate(info: Info): Promise<Info> {
    const exists = await Filesystem.isDir(info.directory)
    if (info.group_ids.length === 0)
      return {
        ...info,
        directory_exists: exists,
      }
    const groups = await GroupRegistry.names(info.group_ids)
    return {
      ...info,
      directory_exists: exists,
      groups: normalizeGroups(groups),
    }
  }

  export async function findByDirectory(directory: string) {
    const items = await list()
    return items.find((item) => item.directory === directory)
  }

  export async function findByProjectID(projectID: string) {
    const items = await list()
    return items.find((item) => item.project_id === projectID)
  }

  export async function add(input: {
    directory: string
    name?: string
    description?: string
    profile_markdown?: string
    group_ids?: string[]
    groups?: string[]
    visibility?: Partial<Visibility>
    created_by?: string
  }) {
    const gitHints = await Filesystem.findUp(".git", input.directory).catch(() => [])
    const resolved = await resolveDirectory(input.directory)
    if (resolved.vcs !== "git" || resolved.worktree === "/") {
      throw new InvalidDirectoryError({
        directory: input.directory,
        message:
          gitHints.length === 0
            ? `No .git directory was found in the selected path or its parent directories: ${input.directory}`
            : `Only git projects can be added to the project registry: ${input.directory}`,
      })
    }

    const existing = await findByDirectory(resolved.worktree)
    if (existing) throw new DuplicateError({ directory: resolved.worktree })

    const group_ids = Array.from(new Set(input.group_ids ?? [])).filter(Boolean)
    const groups = input.groups ?? (await GroupRegistry.names(group_ids))
    const now = Date.now()
    const info: Info = {
      id: crypto.randomUUID(),
      project_id: resolved.id,
      directory: resolved.worktree,
      name: input.name?.trim() || undefined,
      description: input.description?.trim() || undefined,
      profile_markdown: input.profile_markdown?.trim() || undefined,
      group_ids,
      groups: normalizeGroups(groups),
      visibility: normalizeVisibility(input.visibility),
      created_by: input.created_by,
      vcs: resolved.vcs,
      time: {
        created: now,
        updated: now,
      },
    }
    await Storage.write(key(info.id), info)
    await publishUpdated(info)
    log.info("added", { id: info.id, directory: info.directory })
    return info
  }

  export async function update(id: string, editor: (draft: Info) => void) {
    const info = await Storage.update<Info>(key(id), (draft) => {
      draft.groups = normalizeGroups(draft.groups)
      draft.visibility = normalizeVisibility(draft.visibility)
      editor(draft)
      draft.name = draft.name?.trim() || undefined
      draft.description = draft.description?.trim() || undefined
      draft.profile_markdown = draft.profile_markdown?.trim() || undefined
      draft.group_ids = Array.from(new Set(draft.group_ids ?? [])).filter(Boolean)
      draft.groups = normalizeGroups(draft.groups)
      draft.visibility = normalizeVisibility(draft.visibility)
      draft.time.updated = Date.now()
    })
    const parsed = Info.parse(info)
    await publishUpdated(parsed)
    log.info("updated", { id })
    return parsed
  }

  export async function relocate(id: string, directory: string) {
    const gitHints = await Filesystem.findUp(".git", directory).catch(() => [])
    const resolved = await resolveDirectory(directory)
    if (resolved.vcs !== "git" || resolved.worktree === "/") {
      throw new InvalidDirectoryError({
        directory,
        message:
          gitHints.length === 0
            ? `No .git directory was found in the selected path or its parent directories: ${directory}`
            : `Only git projects can be added to the project registry: ${directory}`,
      })
    }

    const existing = await findByDirectory(resolved.worktree)
    if (existing && existing.id !== id) throw new DuplicateError({ directory: resolved.worktree })

    return update(id, (draft) => {
      draft.project_id = resolved.id
      draft.directory = resolved.worktree
      draft.vcs = resolved.vcs
    })
  }

  export async function remove(id: string) {
    const info = await get(id)
    await Storage.remove(key(id))
    GlobalBus.emit("event", {
      directory: "global",
      payload: {
        type: "global.disposed",
        properties: {},
      },
    })
    log.info("removed", { id, directory: info.directory })
    return info
  }
}
