import { GlobalBus } from "@/bus/global"
import { Storage } from "@/storage/storage"
import { Log } from "@/util/log"
import { NamedError } from "@opencode-ai/util/error"
import z from "zod"

export namespace GroupRegistry {
  const log = Log.create({ service: "project.group-registry" })

  export const Info = z
    .object({
      id: z.string(),
      slug: z.string(),
      name: z.string(),
      description: z.string().optional(),
      profile_markdown: z.string().optional(),
      created_by: z.string().optional(),
      time: z.object({
        created: z.number(),
        updated: z.number(),
      }),
    })
    .meta({ ref: "ProjectGroup" })
  export type Info = z.infer<typeof Info>

  export const DuplicateError = NamedError.create(
    "ProjectGroupDuplicateError",
    z.object({
      slug: z.string(),
    }),
  )

  export const NotFoundError = NamedError.create(
    "ProjectGroupNotFoundError",
    z.object({
      id: z.string(),
    }),
  )

  export function normalizeName(input: string) {
    return input.trim()
  }

  export function normalizeDescription(input?: string) {
    return input?.trim() || undefined
  }

  export function normalizeProfile(input?: string) {
    return input?.trim() || undefined
  }

  export function normalizeSlug(input: string) {
    return (
      input
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+/, "")
        .replace(/-+$/, "") || "group"
    )
  }

  function key(id: string) {
    return ["group_registry", id]
  }

  async function publishUpdated() {
    GlobalBus.emit("event", {
      directory: "global",
      payload: {
        type: "global.disposed",
        properties: {},
      },
    })
  }

  export async function list() {
    const keys = await Storage.list(["group_registry"])
    const items = await Promise.all(
      keys.map((x) =>
        Storage.read<Info>(x)
          .then(Info.parse)
          .catch(() => undefined),
      ),
    )
    return items.filter((x): x is Info => !!x).sort((a, b) => a.name.localeCompare(b.name))
  }

  export async function get(id: string) {
    return Storage.read<Info>(key(id))
      .then(Info.parse)
      .catch(() => {
        throw new NotFoundError({ id })
      })
  }

  export async function findBySlug(slug: string) {
    const items = await list()
    return items.find((item) => item.slug === slug)
  }

  export async function names(ids: string[]) {
    if (ids.length === 0) return [] as string[]
    const items = await Promise.all(ids.map((id) => get(id).catch(() => undefined)))
    const map = new Map(items.filter((item): item is Info => !!item).map((item) => [item.id, item.name]))
    return ids.flatMap((id) => {
      const name = map.get(id)
      return name ? [name] : []
    })
  }

  export async function add(input: {
    name: string
    description?: string
    profile_markdown?: string
    created_by?: string
  }) {
    const name = normalizeName(input.name)
    const slug = normalizeSlug(name)
    const existing = await findBySlug(slug)
    if (existing) throw new DuplicateError({ slug })
    const now = Date.now()
    const info = Info.parse({
      id: crypto.randomUUID(),
      slug,
      name,
      description: normalizeDescription(input.description),
      profile_markdown: normalizeProfile(input.profile_markdown),
      created_by: input.created_by,
      time: {
        created: now,
        updated: now,
      },
    })
    await Storage.write(key(info.id), info)
    await publishUpdated()
    log.info("added", { id: info.id, slug: info.slug })
    return info
  }

  export async function update(id: string, editor: (draft: Info) => void) {
    const current = await get(id)
    const next = structuredClone(current)
    editor(next)
    next.name = normalizeName(next.name)
    next.slug = normalizeSlug(next.name)
    next.description = normalizeDescription(next.description)
    next.profile_markdown = normalizeProfile(next.profile_markdown)
    const duplicate = await findBySlug(next.slug)
    if (duplicate && duplicate.id !== current.id) throw new DuplicateError({ slug: next.slug })
    const info = await Storage.update<Info>(key(id), (draft) => {
      draft.name = next.name
      draft.slug = next.slug
      draft.description = next.description
      draft.profile_markdown = next.profile_markdown
      draft.time.updated = Date.now()
    })
    const parsed = Info.parse(info)
    await publishUpdated()
    log.info("updated", { id, slug: parsed.slug })
    return parsed
  }

  export async function remove(id: string) {
    const info = await get(id)
    await Storage.remove(key(id))
    await publishUpdated()
    log.info("removed", { id, slug: info.slug })
    return info
  }
}
