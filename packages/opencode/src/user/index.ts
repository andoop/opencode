import { Storage } from "@/storage/storage"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { Log } from "@/util/log"
import { Identifier } from "@/id/id"
import { fn } from "@/util/fn"
import { NamedError } from "@opencode-ai/util/error"
import { Context } from "@/util/context"
import z from "zod"

export namespace User {
  const log = Log.create({ service: "user" })
  type ModelRef = string | { providerID: string; modelID: string }
  const FEATURE_DEFAULTS = {
    modes: {
      ask: true,
      build: true,
      plan: true,
    },
    files: true,
    models: true,
    providers: true,
    servers: true,
    mcp: true,
  } as const

  // Permission schemas
  export const PermissionLevel = z.enum(["full", "readonly", "custom"])
  export type PermissionLevel = z.infer<typeof PermissionLevel>

  export const PermissionAction = z.enum(["allow", "ask", "deny"])
  export type PermissionAction = z.infer<typeof PermissionAction>

  export const CustomPermission = z.object({
    edit: PermissionAction.optional(),
    write: PermissionAction.optional(),
    bash: PermissionAction.optional(),
    read: PermissionAction.optional(),
  })
  export type CustomPermission = z.infer<typeof CustomPermission>

  export const FeatureModes = z.object({
    ask: z.boolean().optional(),
    build: z.boolean().optional(),
    plan: z.boolean().optional(),
  })
  export type FeatureModes = z.infer<typeof FeatureModes>

  export const Features = z.object({
    modes: FeatureModes.optional(),
    files: z.boolean().optional(),
    models: z.boolean().optional(),
    providers: z.boolean().optional(),
    servers: z.boolean().optional(),
    mcp: z.boolean().optional(),
  })
  export type Features = z.infer<typeof Features>

  export type ResolvedFeatures = {
    modes: {
      ask: boolean
      build: boolean
      plan: boolean
    }
    files: boolean
    models: boolean
    providers: boolean
    servers: boolean
    mcp: boolean
  }

  export type FeatureKey = Exclude<keyof ResolvedFeatures, "modes">
  export type FeatureModeKey = keyof ResolvedFeatures["modes"]

  export const Permission = z.object({
    level: PermissionLevel,
    custom: CustomPermission.optional(),
    allowed_agents: z.array(z.enum(["build", "ask", "plan"])).optional(),
    features: Features.optional(),
    models: z.array(z.string()).nullable().optional(),
  })
  export type Permission = z.infer<typeof Permission>

  export const Role = z.enum(["admin", "user"])
  export type Role = z.infer<typeof Role>

  export const Status = z.enum(["active", "disabled"])
  export type Status = z.infer<typeof Status>

  // User info schema
  export const Info = z
    .object({
      id: Identifier.schema("user"),
      username: z.string().min(3).max(50),
      password: z.string(), // bcrypt hash
      email: z.string().email().optional(),
      role: Role,
      status: Status,
      permission: Permission,
      time: z.object({
        created: z.number(),
        updated: z.number(),
        last_login: z.number().optional(),
      }),
    })
    .meta({ ref: "User" })
  export type Info = z.infer<typeof Info>

  // Public info (without password)
  export const PublicInfo = Info.omit({ password: true })
  export type PublicInfo = z.infer<typeof PublicInfo>

  // Events
  export const Event = {
    Created: BusEvent.define("user.created", z.object({ info: PublicInfo })),
    Updated: BusEvent.define("user.updated", z.object({ info: PublicInfo })),
    Deleted: BusEvent.define("user.deleted", z.object({ info: PublicInfo })),
  }

  // Errors
  export const NotFoundError = NamedError.create(
    "UserNotFoundError",
    z.object({ id: z.string() }),
  )

  export const DuplicateError = NamedError.create(
    "UserDuplicateError",
    z.object({ username: z.string() }),
  )

  export const InvalidCredentialsError = NamedError.create(
    "InvalidCredentialsError",
    z.object({ message: z.string() }),
  )

  export const FeatureDisabledError = NamedError.create(
    "UserFeatureDisabledError",
    z.object({ feature: z.string() }),
  )

  // User context for request scoping
  export interface UserContext {
    id: string
    username: string
    role: Role
    permission: Permission
  }

  const userCtx = Context.create<UserContext | null>("user")
  export const use = userCtx.use
  export const provide = userCtx.provide

  export function current(): UserContext | null {
    try {
      return use()
    } catch {
      return null
    }
  }

  export function isAdmin(): boolean {
    const user = current()
    return user?.role === "admin"
  }

  export function isAuthenticated(): boolean {
    return current() !== null
  }

  export function features(input?: { role?: Role; permission?: Permission }): ResolvedFeatures {
    const role = input?.role ?? current()?.role
    if (role === "admin") {
      return {
        modes: { ...FEATURE_DEFAULTS.modes },
        files: true,
        models: true,
        providers: true,
        servers: true,
        mcp: true,
      }
    }

    const feature = input?.permission?.features
    return {
      modes: {
        ask: feature?.modes?.ask ?? FEATURE_DEFAULTS.modes.ask,
        build: feature?.modes?.build ?? FEATURE_DEFAULTS.modes.build,
        plan: feature?.modes?.plan ?? FEATURE_DEFAULTS.modes.plan,
      },
      files: feature?.files ?? FEATURE_DEFAULTS.files,
      models: feature?.models ?? FEATURE_DEFAULTS.models,
      providers: feature?.providers ?? FEATURE_DEFAULTS.providers,
      servers: feature?.servers ?? FEATURE_DEFAULTS.servers,
      mcp: feature?.mcp ?? FEATURE_DEFAULTS.mcp,
    }
  }

  export function modeEnabled(name: string, input?: { role?: Role; permission?: Permission }) {
    const role = input?.role ?? current()?.role
    if (role === "admin") return true

    if (name !== "ask" && name !== "build" && name !== "plan") return true

    const permission = input?.permission ?? current()?.permission
    const enabled = features({ role, permission }).modes[name]
    if (!enabled) return false
    if (!permission?.allowed_agents) return true
    return permission.allowed_agents.includes(name)
  }

  export function featureEnabled(key: FeatureKey, input?: { role?: Role; permission?: Permission }) {
    return features(input)[key]
  }

  function modelKey(input: ModelRef) {
    if (typeof input === "string") return input
    return `${input.providerID}/${input.modelID}`
  }

  export function modelEnabled(model: ModelRef, input?: { role?: Role; permission?: Permission }) {
    const role = input?.role ?? current()?.role
    if (role === "admin") return true
    const permission = input?.permission ?? current()?.permission
    const allowed = permission?.models
    if (allowed === null) return true
    if (!allowed?.length) return false
    return allowed.includes(modelKey(model))
  }

  export function requireModel(model: ModelRef, input?: { role?: Role; permission?: Permission }) {
    if (modelEnabled(model, input)) return
    throw new FeatureDisabledError({ feature: `models.${modelKey(model)}` })
  }

  export function filterModels<T extends { id: string; models: Record<string, { id: string }> }>(
    items: T[],
    input?: { role?: Role; permission?: Permission },
  ) {
    return items.flatMap((item) => {
      const models = Object.fromEntries(
        Object.values(item.models)
          .filter((model) => modelEnabled({ providerID: item.id, modelID: model.id }, input))
          .map((model) => [model.id, model]),
      )
      if (Object.keys(models).length === 0) return []
      return [{ ...item, models } as T]
    })
  }

  export function requireMode(name: string, input?: { role?: Role; permission?: Permission }) {
    if (modeEnabled(name, input)) return
    throw new FeatureDisabledError({ feature: `modes.${name}` })
  }

  export function requireFeature(key: FeatureKey, input?: { role?: Role; permission?: Permission }) {
    if (featureEnabled(key, input)) return
    throw new FeatureDisabledError({ feature: key })
  }

  // Helper to omit password
  function omitPassword(user: Info): PublicInfo {
    const { password, ...rest } = user
    return rest
  }

  // CRUD operations
  export const create = fn(
    z.object({
      username: z.string().min(3).max(50),
      password: z.string().min(6),
      email: z.string().email().optional(),
      role: Role.optional(),
      permission: Permission.optional(),
    }),
    async (input) => {
      const existing = await byUsername(input.username)
      if (existing) throw new DuplicateError({ username: input.username })

      const now = Date.now()
      const hashedPassword = await Bun.password.hash(input.password, {
        algorithm: "bcrypt",
        cost: 12,
      })

      const user: Info = {
        id: Identifier.descending("user"),
        username: input.username,
        password: hashedPassword,
        email: input.email,
        role: input.role ?? "user",
        status: "active",
        permission: input.permission ?? { level: "full" },
        time: { created: now, updated: now },
      }

      await Storage.write(["user", user.id], user)
      const publicInfo = omitPassword(user)
      Bus.publish(Event.Created, { info: publicInfo })
      log.info("created", { id: user.id, username: user.username })

      return publicInfo
    },
  )

  export const get = fn(Identifier.schema("user"), async (id) => {
    const user = await Storage.read<Info>(["user", id]).catch(() => undefined)
    if (!user) throw new NotFoundError({ id })
    return omitPassword(user)
  })

  // Internal get with password (for auth)
  export async function getInternal(id: string): Promise<Info> {
    const user = await Storage.read<Info>(["user", id]).catch(() => undefined)
    if (!user) throw new NotFoundError({ id })
    return user
  }

  export async function byUsername(username: string): Promise<Info | undefined> {
    const keys = await Storage.list(["user"])
    for (const key of keys) {
      const user = await Storage.read<Info>(key).catch(() => undefined)
      if (user?.username === username) return user
    }
    return undefined
  }

  export async function list(): Promise<PublicInfo[]> {
    const keys = await Storage.list(["user"])
    const users: PublicInfo[] = []
    for (const key of keys) {
      const user = await Storage.read<Info>(key).catch(() => undefined)
      if (user) users.push(omitPassword(user))
    }
    return users.sort((a, b) => b.time.created - a.time.created)
  }

  export async function update(
    id: string,
    editor: (draft: Info) => void,
    options?: { touch?: boolean },
  ): Promise<PublicInfo> {
    const user = await Storage.update<Info>(["user", id], (draft) => {
      editor(draft)
      if (options?.touch !== false) {
        draft.time.updated = Date.now()
      }
    })
    const publicInfo = omitPassword(user)
    Bus.publish(Event.Updated, { info: publicInfo })
    log.info("updated", { id: user.id })
    return publicInfo
  }

  export const remove = fn(Identifier.schema("user"), async (id) => {
    const user = await getInternal(id)
    await Storage.remove(["user", id])
    const publicInfo = omitPassword(user)
    Bus.publish(Event.Deleted, { info: publicInfo })
    log.info("deleted", { id, username: user.username })
  })

  export async function count(): Promise<number> {
    return (await Storage.list(["user"])).length
  }

  // Verify password
  export async function verifyPassword(
    username: string,
    password: string,
  ): Promise<Info | null> {
    const user = await byUsername(username)
    if (!user) return null
    if (user.status !== "active") return null

    const valid = await Bun.password.verify(password, user.password)
    if (!valid) return null

    // Update last login
    await Storage.update<Info>(["user", user.id], (draft) => {
      draft.time.last_login = Date.now()
    }).catch(() => {})

    return user
  }

  // Update password
  export async function updatePassword(id: string, newPassword: string): Promise<void> {
    const hashedPassword = await Bun.password.hash(newPassword, {
      algorithm: "bcrypt",
      cost: 12,
    })
    await update(id, (draft) => {
      draft.password = hashedPassword
    })
    log.info("password_updated", { id })
  }

  // Initialize admin user if no users exist
  export async function initAdmin(): Promise<PublicInfo | null> {
    const userCount = await count()
    if (userCount > 0) return null

    const password = process.env.OPENCODE_ADMIN_PASSWORD || generatePassword()
    const admin = await create({
      username: "admin",
      password,
      role: "admin",
      permission: { level: "full" },
    })

    log.info("admin_initialized", { username: "admin", password })
    console.log(`\n[OpenCode] Created admin user:`)
    console.log(`  Username: admin`)
    console.log(`  Password: ${password}\n`)

    return admin
  }

  function generatePassword(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
    let password = ""
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return password
  }
}
