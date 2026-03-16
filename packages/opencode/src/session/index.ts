import { Slug } from "@opencode-ai/util/slug"
import path from "path"
import fs from "fs/promises"
import { $ } from "bun"
import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { Decimal } from "decimal.js"
import z from "zod"
import { type LanguageModelUsage, type ProviderMetadata } from "ai"
import { Config } from "../config/config"
import { Flag } from "../flag/flag"
import { Identifier } from "../id/id"
import { Installation } from "../installation"

import { Storage } from "../storage/storage"
import { Log } from "../util/log"
import { MessageV2 } from "./message-v2"
import { Instance } from "../project/instance"
import { SessionPrompt } from "./prompt"
import { fn } from "@/util/fn"
import { Command } from "../command"
import { Snapshot } from "@/snapshot"
import { Project } from "../project/project"

import type { Provider } from "@/provider/provider"
import { PermissionNext } from "@/permission/next"
import { Global } from "@/global"
import { User } from "@/user"
import { GlobalBus } from "@/bus/global"
import { Worktree } from "@/worktree"
import { ProjectRegistry } from "@/project/registry"

export namespace Session {
  const log = Log.create({ service: "session" })

  const parentTitlePrefix = "New session - "
  const childTitlePrefix = "Child session - "

  // Helper to check if multi-user mode is enabled
  function isMultiUserMode(): boolean {
    return Flag.OPENCODE_MULTI_USER === "true" || Flag.OPENCODE_MULTI_USER === "1"
  }

  // Get current user ID in multi-user mode
  function currentUserID(): string | undefined {
    if (!isMultiUserMode()) return undefined
    return User.current()?.id
  }

  // Build storage key for session (handles multi-user mode)
  function sessionKey(projectID: string, sessionID: string, userID?: string): string[] {
    if (isMultiUserMode() && userID) {
      return ["user_session", userID, projectID, sessionID]
    }
    return ["session", projectID, sessionID]
  }

  // Build storage prefix for listing sessions
  function sessionListPrefix(projectID: string, userID?: string): string[] {
    if (isMultiUserMode() && userID) {
      return ["user_session", userID, projectID]
    }
    return ["session", projectID]
  }

  // Check if a directory is a session worktree
  function isSessionWorktree(directory: string, projectID: string): boolean {
    const worktreeRoot = path.join(Global.Path.data, "worktree", projectID)
    return directory.startsWith(worktreeRoot + path.sep) || directory === worktreeRoot
  }

  // Get session worktree root directory
  function getSessionWorktreeRoot(projectID: string): string {
    return path.join(Global.Path.data, "worktree", projectID)
  }

  // Clean up worktree for a session
  async function cleanupWorktree(session: Info): Promise<void> {
    if (Instance.project.vcs !== "git") return
    if (!isSessionWorktree(session.directory, session.projectID)) return

    try {
      const { Worktree } = await import("@/worktree")
      await Worktree.remove({ directory: session.directory }).catch((error) => {
        log.warn("failed to remove worktree for session", {
          sessionID: session.id,
          directory: session.directory,
          error: error instanceof Error ? error.message : String(error),
        })
      })

      // Remove from project sandboxes
      await Project.removeSandbox(session.projectID, session.directory).catch(() => undefined)

      log.info("cleaned_up_session_worktree", {
        sessionID: session.id,
        directory: session.directory,
      })
    } catch (error) {
      log.warn("failed to cleanup worktree for session", {
        sessionID: session.id,
        directory: session.directory,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  function createDefaultTitle(isChild = false) {
    return (isChild ? childTitlePrefix : parentTitlePrefix) + new Date().toISOString()
  }

  export function isDefaultTitle(title: string) {
    return new RegExp(
      `^(${parentTitlePrefix}|${childTitlePrefix})\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$`,
    ).test(title)
  }

  function getForkedTitle(title: string): string {
    const match = title.match(/^(.+) \(fork #(\d+)\)$/)
    if (match) {
      const base = match[1]
      const num = parseInt(match[2], 10)
      return `${base} (fork #${num + 1})`
    }
    return `${title} (fork #1)`
  }

  export const Info = z
    .object({
      id: Identifier.schema("session"),
      slug: z.string(),
      projectID: z.string(),
      directory: z.string(),
      userID: Identifier.schema("user").optional(), // User who owns this session (multi-user mode)
      parentID: Identifier.schema("session").optional(),
      summary: z
        .object({
          additions: z.number(),
          deletions: z.number(),
          files: z.number(),
          diffs: Snapshot.FileDiff.array().optional(),
        })
        .optional(),
      share: z
        .object({
          url: z.string(),
        })
        .optional(),
      title: z.string(),
      version: z.string(),
      time: z.object({
        created: z.number(),
        updated: z.number(),
        compacting: z.number().optional(),
        archived: z.number().optional(),
      }),
      permission: PermissionNext.Ruleset.optional(),
      revert: z
        .object({
          messageID: z.string(),
          partID: z.string().optional(),
          snapshot: z.string().optional(),
          diff: z.string().optional(),
        })
        .optional(),
    })
    .meta({
      ref: "Session",
    })
  export type Info = z.output<typeof Info>

  export const ShareInfo = z
    .object({
      secret: z.string(),
      url: z.string(),
    })
    .meta({
      ref: "SessionShare",
    })
  export type ShareInfo = z.output<typeof ShareInfo>

  export const Event = {
    Created: BusEvent.define(
      "session.created",
      z.object({
        info: Info,
      }),
    ),
    Updated: BusEvent.define(
      "session.updated",
      z.object({
        info: Info,
      }),
    ),
    Deleted: BusEvent.define(
      "session.deleted",
      z.object({
        info: Info,
      }),
    ),
    Diff: BusEvent.define(
      "session.diff",
      z.object({
        sessionID: z.string(),
        diff: Snapshot.FileDiff.array(),
      }),
    ),
    Error: BusEvent.define(
      "session.error",
      z.object({
        sessionID: z.string().optional(),
        error: MessageV2.Assistant.shape.error,
      }),
    ),
  }

  export const AdminPrompt = z
    .object({
      messageID: Identifier.schema("message"),
      created: z.number(),
      text: z.string(),
    })
    .meta({
      ref: "SessionAdminPrompt",
    })
  export type AdminPrompt = z.infer<typeof AdminPrompt>

  export const AdminConversationPart = z
    .object({
      type: z.string(),
      count: z.number(),
    })
    .meta({
      ref: "SessionAdminConversationPart",
    })
  export type AdminConversationPart = z.infer<typeof AdminConversationPart>

  export const AdminConversationMessage = z
    .object({
      messageID: Identifier.schema("message"),
      created: z.number(),
      role: z.enum(["user", "assistant"]),
      text: z.string().optional(),
      parts: AdminConversationPart.array(),
    })
    .meta({
      ref: "SessionAdminConversationMessage",
    })
  export type AdminConversationMessage = z.infer<typeof AdminConversationMessage>

  export const AdminAuditEntry = z
    .object({
      session: Info,
      user: z.object({
        id: z.string().optional(),
        username: z.string().optional(),
      }),
      project: z.object({
        id: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        directory: z.string(),
      }),
      message_count: z.number(),
      prompt_count: z.number(),
      last_prompt: z.string().optional(),
      last_prompt_at: z.number().optional(),
    })
    .meta({
      ref: "SessionAdminAuditEntry",
    })
  export type AdminAuditEntry = z.infer<typeof AdminAuditEntry>

  export const AdminAuditSummary = z
    .object({
      sessions: z.number(),
      users: z.number(),
      projects: z.number(),
      prompts: z.number(),
      last_activity: z.number().optional(),
    })
    .meta({
      ref: "SessionAdminAuditSummary",
    })
  export type AdminAuditSummary = z.infer<typeof AdminAuditSummary>

  async function listAllSessions() {
    const prefix = isMultiUserMode() ? ["user_session"] : ["session"]
    const items = await Storage.list(prefix)
    const sessions = await Promise.all(items.map((item) => Storage.read<Info>(item).catch(() => undefined)))
    return sessions.filter((item): item is Info => !!item).toSorted((a, b) => b.time.updated - a.time.updated)
  }

  function promptText(msg: MessageV2.WithParts) {
    if (msg.info.role !== "user") return
    const text = msg.parts
      .filter((part): part is MessageV2.TextPart => part.type === "text")
      .filter((part) => !part.synthetic && !part.ignored)
      .map((part) => part.text.trim())
      .filter(Boolean)
      .join("\n\n")
    if (!text) return
    return {
      messageID: msg.info.id,
      created: msg.info.time.created,
      text,
    } satisfies AdminPrompt
  }

  function conversationMessage(msg: MessageV2.WithParts) {
    const text = msg.parts
      .filter((part): part is MessageV2.TextPart => part.type === "text")
      .filter((part) => !part.synthetic && !part.ignored)
      .map((part) => part.text.trim())
      .filter(Boolean)
      .join("\n\n")
    const counts = msg.parts.reduce(
      (acc, part) => {
        if (part.type === "text" || part.type === "step-start" || part.type === "step-finish") return acc
        acc.set(part.type, (acc.get(part.type) ?? 0) + 1)
        return acc
      },
      new Map<string, number>(),
    )
    const parts = Array.from(counts, ([type, count]) => ({ type, count }))
    if (!text && parts.length === 0) return
    return {
      messageID: msg.info.id,
      created: msg.info.time.created,
      role: msg.info.role,
      text: text || undefined,
      parts,
    } satisfies AdminConversationMessage
  }

  export const adminPrompts = fn(Identifier.schema("session"), async (sessionID) => {
    return (await messages({ sessionID })).flatMap((msg) => {
      const text = promptText(msg)
      return text ? [text] : []
    })
  })

  export const adminConversation = fn(Identifier.schema("session"), async (sessionID) => {
    return (await messages({ sessionID })).flatMap((msg) => {
      const item = conversationMessage(msg)
      return item ? [item] : []
    })
  })

  export const adminAudit = fn(
    z.object({
      search: z.string().optional(),
      userID: Identifier.schema("user").optional(),
      projectID: z.string().optional(),
      limit: z.number().optional(),
    }),
    async (input) => {
      const users = new Map((await User.list()).map((user) => [user.id, user]))
      const projects = new Map((await ProjectRegistry.list()).map((project) => [project.project_id, project]))
      const term = input.search?.trim().toLowerCase()
      const result = [] as AdminAuditEntry[]
      for (const session of await listAllSessions()) {
        if (input.userID && session.userID !== input.userID) continue
        if (input.projectID && session.projectID !== input.projectID) continue
        const prompts = await adminPrompts(session.id)
        const lastPrompt = prompts.at(-1)
        const user = session.userID ? users.get(session.userID) : undefined
        const project = projects.get(session.projectID)
        const row: AdminAuditEntry = {
          session,
          user: {
            id: session.userID,
            username: user?.username,
          },
          project: {
            id: session.projectID,
            name: project?.name,
            description: project?.description,
            directory: project?.directory ?? session.directory,
          },
          message_count: (await messages({ sessionID: session.id })).length,
          prompt_count: prompts.length,
          last_prompt: lastPrompt?.text,
          last_prompt_at: lastPrompt?.created,
        }
        if (term) {
          const haystack = [
            row.session.title,
            row.user.username,
            row.project.name,
            row.project.description,
            row.project.directory,
            row.last_prompt,
          ]
            .filter(Boolean)
            .join("\n")
            .toLowerCase()
          if (!haystack.includes(term)) continue
        }
        result.push(row)
        if (input.limit && result.length >= input.limit) break
      }
      return result
    },
  )

  export const adminSummary = fn(z.object({}), async () => {
    const sessions = await listAllSessions()
    const users = new Set<string>()
    const projects = new Set<string>()
    let prompts = 0
    let lastActivity = 0
    for (const session of sessions) {
      if (session.userID) users.add(session.userID)
      projects.add(session.projectID)
      prompts += (await adminPrompts(session.id)).length
      lastActivity = Math.max(lastActivity, session.time.updated)
    }
    return {
      sessions: sessions.length,
      users: users.size,
      projects: projects.size,
      prompts,
      last_activity: lastActivity || undefined,
    } satisfies AdminAuditSummary
  })

  export const create = fn(
    z
      .object({
        parentID: Identifier.schema("session").optional(),
        title: z.string().optional(),
        permission: Info.shape.permission,
      })
      .optional(),
    async (input) => {
      return createNext({
        parentID: input?.parentID,
        directory: Instance.directory,
        title: input?.title,
        permission: input?.permission,
      })
    },
  )

  export const fork = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      messageID: Identifier.schema("message").optional(),
    }),
    async (input) => {
      const original = await get(input.sessionID)
      if (!original) throw new Error("session not found")
      const title = getForkedTitle(original.title)
      const session = await createNext({
        directory: Instance.directory,
        title,
      })
      const msgs = await messages({ sessionID: input.sessionID })
      const idMap = new Map<string, string>()

      for (const msg of msgs) {
        if (input.messageID && msg.info.id >= input.messageID) break
        const newID = Identifier.ascending("message")
        idMap.set(msg.info.id, newID)

        const parentID = msg.info.role === "assistant" && msg.info.parentID ? idMap.get(msg.info.parentID) : undefined
        const cloned = await updateMessage({
          ...msg.info,
          sessionID: session.id,
          id: newID,
          ...(parentID && { parentID }),
        })

        for (const part of msg.parts) {
          await updatePart({
            ...part,
            id: Identifier.ascending("part"),
            messageID: cloned.id,
            sessionID: session.id,
          })
        }
      }
      return session
    },
  )

  export const touch = fn(Identifier.schema("session"), async (sessionID) => {
    await update(sessionID, (draft) => {
      draft.time.updated = Date.now()
    })
  })

  export async function createNext(input: {
    id?: string
    title?: string
    parentID?: string
    directory: string
    permission?: PermissionNext.Ruleset
    userID?: string
  }) {
    const userID = input.userID ?? currentUserID()
    
    // Generate session ID first to use for worktree branch name
    const sessionID = Identifier.descending("session", input.id)
    
    // For new root sessions (not child sessions), create a dedicated worktree if git project
    let sessionDirectory = input.directory
    if (!input.parentID && Instance.project.vcs === "git") {
      try {
        const branch = `session/${sessionID}`
        const root = getSessionWorktreeRoot(Instance.project.id)
        await fs.mkdir(root, { recursive: true })
        
        // Use session ID as base name, sanitize for filesystem
        const name = sessionID.replace(/[^a-z0-9-]/gi, "-").toLowerCase()
        const worktreeDir = path.join(root, name)
        
        // Check if directory already exists (shouldn't happen with unique session IDs)
        const dirExists = await fs.stat(worktreeDir).then(() => true).catch(() => false)
        if (dirExists) {
          // Verify it's a valid git worktree
          const gitDirCheck = await $`git rev-parse --git-dir`.quiet().nothrow().cwd(worktreeDir)
          if (gitDirCheck.exitCode === 0) {
            log.warn("worktree directory already exists, using existing", { directory: worktreeDir })
            sessionDirectory = worktreeDir
            
            // Publish worktree ready event since worktree already exists and is ready
            const worktreeName = name
            GlobalBus.emit("event", {
              directory: worktreeDir,
              payload: {
                type: Worktree.Event.Ready.type,
                properties: {
                  name: worktreeName,
                  branch,
                },
              },
            })
          } else {
            // Directory exists but is not a valid git repo, try to remove it and create fresh
            log.warn("directory exists but is not a valid git worktree, removing and recreating", {
              directory: worktreeDir,
            })
            await fs.rm(worktreeDir, { recursive: true, force: true }).catch(() => undefined)
            
            // Create worktree with session ID-based branch
            const created = await $`git worktree add --no-checkout -b ${branch} ${worktreeDir}`
              .quiet()
              .nothrow()
              .cwd(Instance.worktree)
            
            if (created.exitCode === 0) {
              await $`git reset --hard`.quiet().nothrow().cwd(worktreeDir)
              await Project.addSandbox(Instance.project.id, worktreeDir).catch(() => undefined)
              sessionDirectory = worktreeDir
              
              // Publish worktree ready event since worktree is already created and populated
              const worktreeName = name
              GlobalBus.emit("event", {
                directory: worktreeDir,
                payload: {
                  type: Worktree.Event.Ready.type,
                  properties: {
                    name: worktreeName,
                    branch,
                  },
                },
              })
              
              log.info("created_session_worktree", { sessionID, branch, directory: worktreeDir })
            }
          }
        } else {
          // Create worktree with session ID-based branch
          const created = await $`git worktree add --no-checkout -b ${branch} ${worktreeDir}`
            .quiet()
            .nothrow()
            .cwd(Instance.worktree)
          
          if (created.exitCode === 0) {
            // Populate worktree
            await $`git reset --hard`.quiet().nothrow().cwd(worktreeDir)
            
            // Add to project sandboxes
            await Project.addSandbox(Instance.project.id, worktreeDir).catch(() => undefined)
            
            sessionDirectory = worktreeDir
            
            // Publish worktree ready event since worktree is already created and populated
            const worktreeName = name
            GlobalBus.emit("event", {
              directory: worktreeDir,
              payload: {
                type: Worktree.Event.Ready.type,
                properties: {
                  name: worktreeName,
                  branch,
                },
              },
            })
            
            log.info("created_session_worktree", { sessionID, branch, directory: worktreeDir })
          } else {
            const errorMsg = created.stderr?.toString() || created.stdout?.toString() || "Unknown error"
            log.warn("failed to create worktree for session, using project directory", {
              sessionID,
              error: errorMsg,
            })
          }
        }
      } catch (error) {
        log.warn("failed to create worktree for session, using project directory", {
          sessionID,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    
    const result: Info = {
      id: sessionID,
      slug: Slug.create(),
      version: Installation.VERSION,
      projectID: Instance.project.id,
      directory: sessionDirectory,
      userID,
      parentID: input.parentID,
      title: input.title ?? createDefaultTitle(!!input.parentID),
      permission: input.permission,
      time: {
        created: Date.now(),
        updated: Date.now(),
      },
    }
    log.info("created", result)
    await Storage.write(sessionKey(Instance.project.id, result.id, userID), result)
    Bus.publish(Event.Created, {
      info: result,
    })
    const cfg = await Config.get()
    if (!result.parentID && (Flag.OPENCODE_AUTO_SHARE || cfg.share === "auto"))
      share(result.id)
        .then((share) => {
          update(result.id, (draft) => {
            draft.share = share
          })
        })
        .catch(() => {
          // Silently ignore sharing errors during session creation
        })
    Bus.publish(Event.Updated, {
      info: result,
    })
    return result
  }

  export function plan(input: { slug: string; time: { created: number } }) {
    const base = Instance.project.vcs
      ? path.join(Instance.worktree, ".opencode", "plans")
      : path.join(Global.Path.data, "plans")
    return path.join(base, [input.time.created, input.slug].join("-") + ".md")
  }

  export const get = fn(Identifier.schema("session"), async (id) => {
    const userID = currentUserID()
    const key = sessionKey(Instance.project.id, id, userID)
    const read = await Storage.read<Info>(key)
    return read as Info
  })

  export const getShare = fn(Identifier.schema("session"), async (id) => {
    return Storage.read<ShareInfo>(["share", id])
  })

  export const share = fn(Identifier.schema("session"), async (id) => {
    const cfg = await Config.get()
    if (cfg.share === "disabled") {
      throw new Error("Sharing is disabled in configuration")
    }
    const { ShareNext } = await import("@/share/share-next")
    const share = await ShareNext.create(id)
    await update(
      id,
      (draft) => {
        draft.share = {
          url: share.url,
        }
      },
      { touch: false },
    )
    return share
  })

  export const unshare = fn(Identifier.schema("session"), async (id) => {
    // Use ShareNext to remove the share (same as share function uses ShareNext to create)
    const { ShareNext } = await import("@/share/share-next")
    await ShareNext.remove(id)
    await update(
      id,
      (draft) => {
        draft.share = undefined
      },
      { touch: false },
    )
  })

  export async function update(id: string, editor: (session: Info) => void, options?: { touch?: boolean }) {
    const project = Instance.project
    const userID = currentUserID()
    const key = sessionKey(project.id, id, userID)
    
    const result = await Storage.update<Info>(key, (draft) => {
      editor(draft)
      if (options?.touch !== false) {
        draft.time.updated = Date.now()
      }
    })
    Bus.publish(Event.Updated, {
      info: result,
    })
    return result
  }

  export const diff = fn(Identifier.schema("session"), async (sessionID) => {
    const diffs = await Storage.read<Snapshot.FileDiff[]>(["session_diff", sessionID])
    return diffs ?? []
  })

  export const messages = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      limit: z.number().optional(),
    }),
    async (input) => {
      const result = [] as MessageV2.WithParts[]
      for await (const msg of MessageV2.stream(input.sessionID)) {
        if (input.limit && result.length >= input.limit) break
        result.push(msg)
      }
      result.reverse()
      return result
    },
  )

  export async function* list() {
    const project = Instance.project
    const userID = currentUserID()
    const prefix = sessionListPrefix(project.id, userID)
    
    for (const item of await Storage.list(prefix)) {
      const session = await Storage.read<Info>(item).catch(() => undefined)
      if (!session) continue
      yield session
    }
  }

  export const children = fn(Identifier.schema("session"), async (parentID) => {
    const project = Instance.project
    const userID = currentUserID()
    const prefix = sessionListPrefix(project.id, userID)
    const result = [] as Session.Info[]
    for (const item of await Storage.list(prefix)) {
      const session = await Storage.read<Info>(item).catch(() => undefined)
      if (!session) continue
      if (session.parentID !== parentID) continue
      result.push(session)
    }
    return result
  })

  export const remove = fn(Identifier.schema("session"), async (sessionID) => {
    const project = Instance.project
    const userID = currentUserID()
    try {
      const session = await get(sessionID)
      for (const child of await children(sessionID)) {
        await remove(child.id)
      }
      await unshare(sessionID).catch(() => {})
      for (const msg of await Storage.list(["message", sessionID])) {
        for (const part of await Storage.list(["part", msg.at(-1)!])) {
          await Storage.remove(part)
        }
        await Storage.remove(msg)
      }
      
      // Clean up worktree if this session has one
      await cleanupWorktree(session)
      
      await Storage.remove(sessionKey(project.id, sessionID, session.userID ?? userID))
      Bus.publish(Event.Deleted, {
        info: session,
      })
    } catch (e) {
      log.error(e)
    }
  })

  export const updateMessage = fn(MessageV2.Info, async (msg) => {
    await Storage.write(["message", msg.sessionID, msg.id], msg)
    Bus.publish(MessageV2.Event.Updated, {
      info: msg,
    })
    return msg
  })

  export const removeMessage = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      messageID: Identifier.schema("message"),
    }),
    async (input) => {
      await Storage.remove(["message", input.sessionID, input.messageID])
      Bus.publish(MessageV2.Event.Removed, {
        sessionID: input.sessionID,
        messageID: input.messageID,
      })
      return input.messageID
    },
  )

  export const removePart = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      messageID: Identifier.schema("message"),
      partID: Identifier.schema("part"),
    }),
    async (input) => {
      await Storage.remove(["part", input.messageID, input.partID])
      Bus.publish(MessageV2.Event.PartRemoved, {
        sessionID: input.sessionID,
        messageID: input.messageID,
        partID: input.partID,
      })
      return input.partID
    },
  )

  const UpdatePartInput = z.union([
    MessageV2.Part,
    z.object({
      part: MessageV2.TextPart,
      delta: z.string(),
    }),
    z.object({
      part: MessageV2.ReasoningPart,
      delta: z.string(),
    }),
  ])

  export const updatePart = fn(UpdatePartInput, async (input) => {
    const part = "delta" in input ? input.part : input
    const delta = "delta" in input ? input.delta : undefined
    await Storage.write(["part", part.messageID, part.id], part)
    Bus.publish(MessageV2.Event.PartUpdated, {
      part,
      delta,
    })
    return part
  })

  export const getUsage = fn(
    z.object({
      model: z.custom<Provider.Model>(),
      usage: z.custom<LanguageModelUsage>(),
      metadata: z.custom<ProviderMetadata>().optional(),
    }),
    (input) => {
      const cacheReadInputTokens = input.usage.cachedInputTokens ?? 0
      const cacheWriteInputTokens = (input.metadata?.["anthropic"]?.["cacheCreationInputTokens"] ??
        // @ts-expect-error
        input.metadata?.["bedrock"]?.["usage"]?.["cacheWriteInputTokens"] ??
        // @ts-expect-error
        input.metadata?.["venice"]?.["usage"]?.["cacheCreationInputTokens"] ??
        0) as number

      const excludesCachedTokens = !!(input.metadata?.["anthropic"] || input.metadata?.["bedrock"])
      const adjustedInputTokens = excludesCachedTokens
        ? (input.usage.inputTokens ?? 0)
        : (input.usage.inputTokens ?? 0) - cacheReadInputTokens - cacheWriteInputTokens
      const safe = (value: number) => {
        if (!Number.isFinite(value)) return 0
        return value
      }

      const tokens = {
        input: safe(adjustedInputTokens),
        output: safe(input.usage.outputTokens ?? 0),
        reasoning: safe(input.usage?.reasoningTokens ?? 0),
        cache: {
          write: safe(cacheWriteInputTokens),
          read: safe(cacheReadInputTokens),
        },
      }

      const costInfo =
        input.model.cost?.experimentalOver200K && tokens.input + tokens.cache.read > 200_000
          ? input.model.cost.experimentalOver200K
          : input.model.cost
      return {
        cost: safe(
          new Decimal(0)
            .add(new Decimal(tokens.input).mul(costInfo?.input ?? 0).div(1_000_000))
            .add(new Decimal(tokens.output).mul(costInfo?.output ?? 0).div(1_000_000))
            .add(new Decimal(tokens.cache.read).mul(costInfo?.cache?.read ?? 0).div(1_000_000))
            .add(new Decimal(tokens.cache.write).mul(costInfo?.cache?.write ?? 0).div(1_000_000))
            // TODO: update models.dev to have better pricing model, for now:
            // charge reasoning tokens at the same rate as output tokens
            .add(new Decimal(tokens.reasoning).mul(costInfo?.output ?? 0).div(1_000_000))
            .toNumber(),
        ),
        tokens,
      }
    },
  )

  export class BusyError extends Error {
    constructor(public readonly sessionID: string) {
      super(`Session ${sessionID} is busy`)
    }
  }

  export const initialize = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      modelID: z.string(),
      providerID: z.string(),
      messageID: Identifier.schema("message"),
    }),
    async (input) => {
      await SessionPrompt.command({
        sessionID: input.sessionID,
        messageID: input.messageID,
        model: input.providerID + "/" + input.modelID,
        command: Command.Default.INIT,
        arguments: "",
      })
    },
  )
}
