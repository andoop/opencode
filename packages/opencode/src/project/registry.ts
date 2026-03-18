import { GlobalBus } from "@/bus/global"
import { Storage } from "@/storage/storage"
import { Log } from "@/util/log"
import { Filesystem } from "@/util/filesystem"
import { NamedError } from "@opencode-ai/util/error"
import z from "zod"
import { resolveDirectory } from "./resolve"

export namespace ProjectRegistry {
  const log = Log.create({ service: "project.registry" })

  export const Info = z
    .object({
      id: z.string(),
      project_id: z.string(),
      directory: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
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
    const items = await Promise.all(keys.map((x) => Storage.read<Info>(x).catch(() => undefined)))
    return items
      .filter((x): x is Info => !!x)
      .sort((a, b) => (a.name ?? a.directory).localeCompare(b.name ?? b.directory))
  }

  export async function get(id: string) {
    return Storage.read<Info>(key(id))
  }

  export async function findByDirectory(directory: string) {
    const items = await list()
    return items.find((item) => item.directory === directory)
  }

  export async function findByProjectID(projectID: string) {
    const items = await list()
    return items.find((item) => item.project_id === projectID)
  }

  export async function add(input: { directory: string; name?: string; description?: string; created_by?: string }) {
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

    const now = Date.now()
    const info: Info = {
      id: crypto.randomUUID(),
      project_id: resolved.id,
      directory: resolved.worktree,
      name: input.name?.trim() || undefined,
      description: input.description?.trim() || undefined,
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
      editor(draft)
      draft.name = draft.name?.trim() || undefined
      draft.description = draft.description?.trim() || undefined
      draft.time.updated = Date.now()
    })
    await publishUpdated(info)
    log.info("updated", { id })
    return info
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
