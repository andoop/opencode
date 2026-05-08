import { Hono } from "hono"
import { stream } from "hono/streaming"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import path from "path"
import { createWriteStream } from "fs"
import fs from "fs/promises"
import Busboy from "busboy"
import { Readable } from "stream"
import { pipeline } from "stream/promises"
import type { ReadableStream as WebReadableStream } from "stream/web"
import { Session } from "../../session"
import { MessageV2 } from "../../session/message-v2"
import { SessionPrompt } from "../../session/prompt"
import { SessionCompaction } from "../../session/compaction"
import { SessionRevert } from "../../session/revert"
import { SessionStatus } from "@/session/status"
import { Todo } from "../../session/todo"
import { Agent } from "../../agent/agent"
import { Log } from "../../util/log"
import { PermissionNext } from "@/permission/next"
import { CursorCLI } from "@/cursor/cli"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { Instance } from "@/project/instance"
import { Project } from "@/project/project"
import { Provider } from "@/provider/provider"
import { ToolRegistry } from "@/tool/registry"
import { User } from "@/user"
import { Workspace } from "@/workspace"

const log = Log.create({ service: "server" })
const ATTACHMENT_MAX_BYTES = 500 * 1024 * 1024
const ATTACHMENT_CHUNK_BYTES = 8 * 1024 * 1024

const AttachmentUpload = z
  .object({
    filename: z.string(),
    mime: z.string(),
    size: z.number(),
    path: z.string(),
    url: z.string(),
  })
  .meta({
    ref: "SessionAttachmentUpload",
  })

const AttachmentUploadInit = z
  .object({
    filename: z.string(),
    mime: z.string().optional(),
    size: z.number().int().min(0),
  })
  .meta({
    ref: "SessionAttachmentUploadInit",
  })

const AttachmentUploadInitResponse = z
  .object({
    uploadID: z.string(),
    chunkSize: z.number(),
    received: z.number(),
  })
  .meta({
    ref: "SessionAttachmentUploadInitResponse",
  })

const AttachmentUploadChunkResponse = z
  .object({
    received: z.number(),
    complete: z.boolean(),
  })
  .meta({
    ref: "SessionAttachmentUploadChunkResponse",
  })

const AttachmentUploadState = z.object({
  filename: z.string(),
  mime: z.string(),
  size: z.number(),
  received: z.number(),
  chunkSize: z.number(),
  createdAt: z.number(),
})

function safeAttachmentName(name: string) {
  const base = path.basename(name.replaceAll("\\", "/")).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
  const safe = base.replace(/^\.+/, "").trim() || "attachment"
  const parsed = path.parse(safe)
  const ext = parsed.ext.slice(0, 24)
  const stem = (parsed.name || "attachment").slice(0, Math.max(1, 80 - ext.length))
  return stem + ext
}

async function uniqueAttachmentName(dir: string, name: string) {
  const safe = safeAttachmentName(name)
  const ext = path.extname(safe)
  const stem = safe.slice(0, safe.length - ext.length) || "attachment"
  for (const index of Array.from({ length: 1000 }, (_, i) => i)) {
    const filename = index === 0 ? safe : `${stem}-${index}${ext}`
    try {
      await fs.access(path.join(dir, filename))
    } catch {
      return filename
    }
  }
  return `${stem}-${Date.now().toString(36)}${ext}`
}

function attachmentUploadsDir(sessionDir: string) {
  return path.join(sessionDir, ".tmp", "uploads")
}

function attachmentUploadDir(sessionDir: string, uploadID: string) {
  return path.join(attachmentUploadsDir(sessionDir), uploadID)
}

function attachmentUploadStatePath(sessionDir: string, uploadID: string) {
  return path.join(attachmentUploadDir(sessionDir, uploadID), "state.json")
}

function attachmentUploadBlobPath(sessionDir: string, uploadID: string) {
  return path.join(attachmentUploadDir(sessionDir, uploadID), "blob")
}

async function attachmentUploadStateRead(sessionDir: string, uploadID: string) {
  try {
    return AttachmentUploadState.parse(await Bun.file(attachmentUploadStatePath(sessionDir, uploadID)).json())
  } catch {
    throw new AttachmentError("Upload not found", 404)
  }
}

async function attachmentUploadStateWrite(
  sessionDir: string,
  uploadID: string,
  state: z.infer<typeof AttachmentUploadState>,
) {
  await Bun.write(attachmentUploadStatePath(sessionDir, uploadID), JSON.stringify(state))
}

async function attachmentUploadCleanup(sessionDir: string, uploadID: string) {
  await fs.rm(attachmentUploadDir(sessionDir, uploadID), { recursive: true, force: true })
}

async function attachmentUploadPrune(sessionDir: string) {
  const root = attachmentUploadsDir(sessionDir)
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          const state = await AttachmentUploadState.parseAsync(
            await Bun.file(path.join(root, entry.name, "state.json")).json(),
          )
          if (state.createdAt < cutoff) {
            await fs.rm(path.join(root, entry.name), { recursive: true, force: true })
          }
        } catch {
          await fs.rm(path.join(root, entry.name), { recursive: true, force: true }).catch(() => {})
        }
      }),
  )
}

class AttachmentError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 413,
  ) {
    super(message)
  }
}

class AttachmentOffsetError extends AttachmentError {
  constructor(
    message: string,
    readonly received: number,
  ) {
    super(message, 409)
  }
}

async function uploadAttachment(req: Request, dir: string) {
  if (!req.body) throw new AttachmentError("Missing file", 400)

  let parser
  try {
    parser = Busboy({
      headers: Object.fromEntries(req.headers.entries()),
      limits: { files: 1, fileSize: ATTACHMENT_MAX_BYTES },
    })
  } catch {
    throw new AttachmentError("Invalid multipart upload", 400)
  }

  let upload: Promise<void> | undefined
  let result: z.infer<typeof AttachmentUpload> | undefined
  let parseError: AttachmentError | undefined

  parser.on("filesLimit", () => {
    parseError = new AttachmentError("Only one file is allowed", 400)
  })

  parser.on(
    "file",
    (
      _,
      file: NodeJS.ReadableStream & {
        truncated?: boolean
      },
      info: {
        filename?: string
        mimeType?: string
      },
    ) => {
      upload = (async () => {
        const filename = await uniqueAttachmentName(dir, info.filename || "attachment")
        const target = path.join(dir, filename)
        try {
          await pipeline(file, createWriteStream(target))
        } catch (error) {
          await fs.unlink(target).catch(() => {})
          throw error
        }

        if (file.truncated) {
          await fs.unlink(target).catch(() => {})
          throw new AttachmentError("Attachment exceeds the 500MB limit", 413)
        }

        const size = Number(req.headers.get("x-opencode-attachment-size") ?? "0")
        result = {
          filename,
          mime: info.mimeType || "application/octet-stream",
          size: size || Bun.file(target).size,
          path: target,
          url: `file://${target}`,
        }
      })()
    },
  )

  await pipeline(Readable.fromWeb(req.body as unknown as WebReadableStream<Uint8Array>), parser)
  if (parseError) throw parseError

  if (!upload) throw new AttachmentError("Missing file", 400)
  await upload
  if (!result) throw new AttachmentError("Missing file", 400)
  return result
}

async function uploadAttachmentChunk(req: Request, sessionDir: string, uploadID: string, offset: number) {
  if (!req.body) throw new AttachmentError("Missing chunk body", 400)

  const state = await attachmentUploadStateRead(sessionDir, uploadID)
  if (offset !== state.received) {
    throw new AttachmentOffsetError("Unexpected chunk offset", state.received)
  }

  const remaining = state.size - state.received
  if (remaining <= 0) {
    return { received: state.received, complete: true }
  }

  const max = Math.min(state.chunkSize, remaining)
  const blob = attachmentUploadBlobPath(sessionDir, uploadID)
  const file = await fs.open(blob, "a")
  let written = 0

  try {
    const reader = req.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      written += value.byteLength
      if (written > max) {
        throw new AttachmentError("Chunk exceeds allowed size", 400)
      }
      await file.write(value)
    }
  } catch (error) {
    await file.close().catch(() => {})
    if (written > 0) {
      await fs.truncate(blob, state.received).catch(() => {})
    }
    throw error
  }

  await file.close()
  state.received += written
  await attachmentUploadStateWrite(sessionDir, uploadID, state)
  return {
    received: state.received,
    complete: state.received >= state.size,
  }
}

async function uploadAttachmentComplete(sessionDir: string, uploadID: string, attachmentsDir: string) {
  const state = await attachmentUploadStateRead(sessionDir, uploadID)
  if (state.received !== state.size) {
    throw new AttachmentOffsetError("Upload is incomplete", state.received)
  }

  await fs.mkdir(attachmentsDir, { recursive: true })
  const filename = await uniqueAttachmentName(attachmentsDir, state.filename)
  const target = path.join(attachmentsDir, filename)
  await fs.rename(attachmentUploadBlobPath(sessionDir, uploadID), target)
  await attachmentUploadCleanup(sessionDir, uploadID)
  return {
    filename,
    mime: state.mime || "application/octet-stream",
    size: state.size,
    path: target,
    url: `file://${target}`,
  }
}

function requireAdmin() {
  return async (c: any, next: any) => {
    const user = User.current()
    if (!user || user.role !== "admin") {
      return c.json({ error: "Admin access required" }, 403)
    }
    return next()
  }
}

const MentionInfo = z
  .object({
    sessionID: z.string(),
    messageID: z.string(),
    targetType: z.enum(["agent", "user", "role"]),
    targetID: z.string().optional(),
    label: z.string(),
    created: z.number().optional(),
  })
  .meta({
    ref: "SessionMention",
  })

async function requireParticipant(sessionID: string) {
  const session = await Session.get(sessionID)
  Session.requireParticipant(session)
  return session
}

export const SessionRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List sessions",
        description: "Get a list of all OpenCode sessions, sorted by most recently updated.",
        operationId: "session.list",
        responses: {
          200: {
            description: "List of sessions",
            content: {
              "application/json": {
                schema: resolver(Session.Info.array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          directory: z.string().optional().meta({ description: "Filter sessions by project directory" }),
          roots: z.coerce.boolean().optional().meta({ description: "Only return root sessions (no parentID)" }),
          start: z.coerce
            .number()
            .optional()
            .meta({ description: "Filter sessions updated on or after this timestamp (milliseconds since epoch)" }),
          search: z.string().optional().meta({ description: "Filter sessions by title (case-insensitive)" }),
          limit: z.coerce.number().optional().meta({ description: "Maximum number of sessions to return" }),
        }),
      ),
      async (c) => {
        const query = c.req.valid("query")
        if (query.directory) {
          const workspace = await Workspace.fromDirectory(query.directory)
          if (!workspace) {
            await Project.assertDirectoryAccess(query.directory)
          }
        }
        const term = query.search?.toLowerCase()
        const sessions: Session.Info[] = []
        for await (const session of Session.list({ directory: query.directory })) {
          if (!Session.isParticipant(session)) continue
          if (query.roots && session.parentID) continue
          if (query.start !== undefined && session.time.updated < query.start) continue
          if (term !== undefined && !session.title.toLowerCase().includes(term)) continue
          sessions.push(session)
          if (query.limit !== undefined && sessions.length >= query.limit) break
        }
        return c.json(sessions)
      },
    )
    .get(
      "/admin/summary",
      describeRoute({
        summary: "Get admin session summary",
        description: "Retrieve cross-user session statistics for admins.",
        operationId: "session.admin.summary",
        responses: {
          200: {
            description: "Admin session summary",
            content: {
              "application/json": {
                schema: resolver(Session.AdminAuditSummary),
              },
            },
          },
          ...errors(403),
        },
      }),
      requireAdmin(),
      async (c) => {
        return c.json(await Session.adminSummary({}))
      },
    )
    .get(
      "/admin/list",
      describeRoute({
        summary: "List admin session audit entries",
        description: "Retrieve cross-user session audit entries for admins.",
        operationId: "session.admin.list",
        responses: {
          200: {
            description: "Admin session audit entries",
            content: {
              "application/json": {
                schema: resolver(Session.AdminAuditEntry.array()),
              },
            },
          },
          ...errors(403),
        },
      }),
      requireAdmin(),
      validator(
        "query",
        z.object({
          search: z.string().optional(),
          userID: z.string().optional(),
          projectID: z.string().optional(),
          limit: z.coerce.number().optional(),
        }),
      ),
      async (c) => {
        return c.json(await Session.adminAudit(c.req.valid("query")))
      },
    )
    .get(
      "/admin/:sessionID/messages",
      describeRoute({
        summary: "Get admin session conversation",
        description: "Retrieve session conversation messages for admin auditing.",
        operationId: "session.admin.messages",
        responses: {
          200: {
            description: "Admin session conversation",
            content: {
              "application/json": {
                schema: resolver(Session.AdminConversationMessage.array()),
              },
            },
          },
          ...errors(403),
        },
      }),
      requireAdmin(),
      validator("param", z.object({ sessionID: z.string() })),
      async (c) => {
        return c.json(await Session.adminConversation(c.req.valid("param").sessionID))
      },
    )
    .get(
      "/status",
      describeRoute({
        summary: "Get session status",
        description: "Retrieve the current status of all sessions, including active, idle, and completed states.",
        operationId: "session.status",
        responses: {
          200: {
            description: "Get session status",
            content: {
              "application/json": {
                schema: resolver(z.record(z.string(), SessionStatus.Info)),
              },
            },
          },
          ...errors(400),
        },
      }),
      async (c) => {
        const result = SessionStatus.list()
        return c.json(result)
      },
    )
    .get(
      "/room/inbox",
      describeRoute({
        summary: "List my project rooms",
        description: "List project room threads that the current user can access.",
        operationId: "session.room.inbox",
        responses: {
          200: {
            description: "Accessible room threads",
            content: {
              "application/json": {
                schema: resolver(Session.RoomInboxEntry.array()),
              },
            },
          },
          ...errors(403),
        },
      }),
      async (c) => {
        if (!User.current()) return c.json({ error: "Authentication required" }, 403)
        return c.json(await Session.roomInbox({}))
      },
    )
    .get(
      "/:sessionID/open",
      describeRoute({
        summary: "Open project room",
        description: "Resolve a project room thread into a directory and session that the current user can open.",
        operationId: "session.room.open",
        responses: {
          200: {
            description: "Room open target",
            content: {
              "application/json": {
                schema: resolver(Session.RoomOpenInfo),
              },
            },
          },
          ...errors(400, 403, 404),
        },
      }),
      validator("param", z.object({ sessionID: z.string().meta({ description: "Session ID" }) })),
      async (c) => {
        return c.json(await Session.openRoom(c.req.valid("param").sessionID))
      },
    )
    .get(
      "/:sessionID",
      describeRoute({
        summary: "Get session",
        description: "Retrieve detailed information about a specific OpenCode session.",
        tags: ["Session"],
        operationId: "session.get",
        responses: {
          200: {
            description: "Get session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404, 413),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: Session.get.schema,
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        log.info("SEARCH", { url: c.req.url })
        const session = await requireParticipant(sessionID)
        return c.json(session)
      },
    )
    .get(
      "/:sessionID/children",
      describeRoute({
        summary: "Get session children",
        tags: ["Session"],
        description: "Retrieve all child sessions that were forked from the specified parent session.",
        operationId: "session.children",
        responses: {
          200: {
            description: "List of children",
            content: {
              "application/json": {
                schema: resolver(Session.Info.array()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: Session.children.schema,
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const session = await Session.children(sessionID)
        return c.json(session)
      },
    )
    .get(
      "/:sessionID/todo",
      describeRoute({
        summary: "Get session todos",
        description: "Retrieve the todo list associated with a specific session, showing tasks and action items.",
        operationId: "session.todo",
        responses: {
          200: {
            description: "Todo list",
            content: {
              "application/json": {
                schema: resolver(Todo.Info.array()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const todos = await Todo.get(sessionID)
        return c.json(todos)
      },
    )
    .get(
      "/:sessionID/participants",
      describeRoute({
        summary: "Get room participants",
        description: "Retrieve participants for a project room thread.",
        operationId: "session.room.participants",
        responses: {
          200: {
            description: "Room participants",
            content: {
              "application/json": {
                schema: resolver(Session.Info.shape.room.unwrap().shape.participants),
              },
            },
          },
          ...errors(400, 403, 404),
        },
      }),
      validator("param", z.object({ sessionID: z.string().meta({ description: "Session ID" }) })),
      async (c) => {
        return c.json(await Session.participants(c.req.valid("param").sessionID))
      },
    )
    .post(
      "/:sessionID/participants",
      describeRoute({
        summary: "Add room participant",
        description: "Add a registered user to a project room thread.",
        operationId: "session.room.participant.add",
        responses: {
          200: {
            description: "Updated session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 403, 404),
        },
      }),
      validator("param", z.object({ sessionID: z.string().meta({ description: "Session ID" }) })),
      validator("json", Session.ParticipantInput),
      async (c) => {
        return c.json(
          await Session.addParticipant({
            sessionID: c.req.valid("param").sessionID,
            participant: c.req.valid("json"),
          }),
        )
      },
    )
    .delete(
      "/:sessionID/participants/:userID",
      describeRoute({
        summary: "Remove room participant",
        description: "Remove a user from a project room thread.",
        operationId: "session.room.participant.remove",
        responses: {
          200: {
            description: "Updated session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 403, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
          userID: z.string().meta({ description: "User ID" }),
        }),
      ),
      async (c) => {
        const params = c.req.valid("param")
        return c.json(await Session.removeParticipant(params))
      },
    )
    .patch(
      "/:sessionID/participants/:userID",
      describeRoute({
        summary: "Update room participant",
        description: "Update a participant's project role or display title in a project room thread.",
        operationId: "session.room.participant.update",
        responses: {
          200: {
            description: "Updated session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 403, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
          userID: z.string().meta({ description: "User ID" }),
        }),
      ),
      validator("json", Session.ParticipantUpdateInput),
      async (c) => {
        const params = c.req.valid("param")
        return c.json(
          await Session.updateParticipant({
            sessionID: params.sessionID,
            userID: params.userID,
            updates: c.req.valid("json"),
          }),
        )
      },
    )
    .patch(
      "/:sessionID/group",
      describeRoute({
        summary: "Update room settings",
        description: "Update project room title, agent, auto-join behavior, or stage.",
        operationId: "session.room.update",
        responses: {
          200: {
            description: "Updated session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 403, 404),
        },
      }),
      validator("param", z.object({ sessionID: z.string().meta({ description: "Session ID" }) })),
      validator("json", Session.UpdateRoomInput),
      async (c) => {
        return c.json(
          await Session.updateRoom({
            sessionID: c.req.valid("param").sessionID,
            updates: c.req.valid("json"),
          }),
        )
      },
    )
    .patch(
      "/:sessionID/group/stage",
      describeRoute({
        summary: "Update room stage",
        description: "Move a project room thread through clarification, discussion, proposal, and execution.",
        operationId: "session.room.stage",
        responses: {
          200: {
            description: "Updated session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 403, 404),
        },
      }),
      validator("param", z.object({ sessionID: z.string().meta({ description: "Session ID" }) })),
      validator("json", z.object({ stage: Session.UpdateRoomInput.shape.stage.unwrap() })),
      async (c) => {
        return c.json(
          await Session.updateRoom({
            sessionID: c.req.valid("param").sessionID,
            updates: { stage: c.req.valid("json").stage },
          }),
        )
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Create session",
        description: "Create a new OpenCode session for interacting with AI assistants and managing conversations.",
        operationId: "session.create",
        responses: {
          ...errors(400),
          200: {
            description: "Successfully created session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
        },
      }),
      validator("json", Session.create.schema.optional()),
      async (c) => {
        const body = c.req.valid("json") ?? {}
        const session = await Session.create(body)
        return c.json(session)
      },
    )
    .post(
      "/room",
      describeRoute({
        summary: "Create project room thread",
        description: "Create a collaborative room thread for a workspace/project.",
        operationId: "session.room.create",
        responses: {
          ...errors(400, 403),
          200: {
            description: "Created room thread",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
        },
      }),
      validator("json", Session.createRoomThread.schema),
      async (c) => {
        if (!User.current()) return c.json({ error: "Authentication required" }, 403)
        return c.json(await Session.createRoomThread(c.req.valid("json")))
      },
    )
    .delete(
      "/:sessionID",
      describeRoute({
        summary: "Delete session",
        description: "Delete a session and permanently remove all associated data, including messages and history.",
        operationId: "session.delete",
        responses: {
          200: {
            description: "Successfully deleted session",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: Session.remove.schema,
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        await Session.remove(sessionID)
        return c.json(true)
      },
    )
    .patch(
      "/:sessionID",
      describeRoute({
        summary: "Update session",
        description: "Update properties of an existing session, such as title or other metadata.",
        operationId: "session.update",
        responses: {
          200: {
            description: "Successfully updated session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
        }),
      ),
      validator(
        "json",
        z.object({
          title: z.string().optional(),
          time: z
            .object({
              archived: z.number().optional(),
            })
            .optional(),
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const updates = c.req.valid("json")

        const updatedSession = await Session.update(
          sessionID,
          (session) => {
            if (updates.title !== undefined) {
              session.title = updates.title
            }
            if (updates.time?.archived !== undefined) session.time.archived = updates.time.archived
          },
          { touch: false },
        )

        return c.json(updatedSession)
      },
    )
    .post(
      "/:sessionID/warm",
      describeRoute({
        summary: "Warm session agent",
        description: "Pre-initialize Cursor CLI for this session so the first visible prompt can reuse a warm ACP session.",
        operationId: "session.warm",
        responses: {
          200: {
            description: "Warm request accepted",
            content: {
              "application/json": {
                schema: resolver(z.object({ ok: z.boolean() })),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ sessionID: z.string().meta({ description: "Session ID" }) })),
      validator(
        "json",
        z.object({
          agent: z.string(),
          model: z.object({
            providerID: z.string(),
            modelID: z.string(),
          }),
        }),
      ),
      async (c) => {
        const session = await requireParticipant(c.req.valid("param").sessionID)
        const body = c.req.valid("json")
        if (body.model.providerID !== "cursor-cli") return c.json({ ok: true })
        const agent = await Agent.get(body.agent)
        const model = await Provider.getModel(body.model.providerID, body.model.modelID)
        const tools = Object.fromEntries(
          (await ToolRegistry.tools({ modelID: model.api.id, providerID: model.providerID }, agent)).map((tool) => [
            tool.id,
            true,
          ]),
        )
        for (const tool of PermissionNext.disabled(Object.keys(tools), agent.permission)) {
          delete tools[tool]
        }
        void CursorCLI.warm({
          sessionID: session.id,
          modelID: model.id,
          agent: agent.name,
          cwd: session.directory,
          allowedTools: Object.keys(tools),
        }).catch((error) => {
          log.warn("cursor cli warm failed", {
            sessionID: session.id,
            modelID: model.id,
            error: error instanceof Error ? error.message : String(error),
          })
        })
        return c.json({ ok: true })
      },
    )
    .post(
      "/:sessionID/attachment/init",
      describeRoute({
        summary: "Initialize attachment upload",
        description: "Create an upload session for chunked attachment upload.",
        operationId: "session.attachment.init",
        responses: {
          200: {
            description: "Initialized attachment upload",
            content: {
              "application/json": {
                schema: resolver(AttachmentUploadInitResponse),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      validator("json", AttachmentUploadInit),
      async (c) => {
        const body = c.req.valid("json")
        if (body.size > ATTACHMENT_MAX_BYTES) {
          return c.json({ message: "Attachment exceeds the 500MB limit" }, 413)
        }

        const session = await Session.get(c.req.valid("param").sessionID)
        await fs.mkdir(attachmentUploadsDir(session.directory), { recursive: true })
        await attachmentUploadPrune(session.directory)

        const uploadID = crypto.randomUUID()
        await fs.mkdir(attachmentUploadDir(session.directory, uploadID), { recursive: true })
        await attachmentUploadStateWrite(session.directory, uploadID, {
          filename: body.filename,
          mime: body.mime || "application/octet-stream",
          size: body.size,
          received: 0,
          chunkSize: ATTACHMENT_CHUNK_BYTES,
          createdAt: Date.now(),
        })

        return c.json({
          uploadID,
          chunkSize: ATTACHMENT_CHUNK_BYTES,
          received: 0,
        })
      },
    )
    .put(
      "/:sessionID/attachment/:uploadID/chunk",
      describeRoute({
        summary: "Upload attachment chunk",
        description: "Append a chunk to a chunked attachment upload.",
        operationId: "session.attachment.chunk",
        responses: {
          200: {
            description: "Uploaded chunk",
            content: {
              "application/json": {
                schema: resolver(AttachmentUploadChunkResponse),
              },
            },
          },
          ...errors(400, 404, 409),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
          uploadID: z.string().min(1).meta({ description: "Upload ID" }),
        }),
      ),
      validator(
        "query",
        z.object({
          offset: z.coerce.number().int().min(0),
        }),
      ),
      async (c) => {
        const params = c.req.valid("param")
        const query = c.req.valid("query")
        const session = await Session.get(params.sessionID)

        try {
          return c.json(await uploadAttachmentChunk(c.req.raw, session.directory, params.uploadID, query.offset))
        } catch (error) {
          if (error instanceof AttachmentOffsetError) {
            return c.json({ message: error.message, received: error.received }, error.status)
          }
          if (error instanceof AttachmentError) {
            return c.json({ message: error.message }, error.status)
          }
          throw error
        }
      },
    )
    .post(
      "/:sessionID/attachment/:uploadID/complete",
      describeRoute({
        summary: "Complete attachment upload",
        description: "Finalize a chunked attachment upload and move it into the attachments directory.",
        operationId: "session.attachment.complete",
        responses: {
          200: {
            description: "Completed upload",
            content: {
              "application/json": {
                schema: resolver(AttachmentUpload),
              },
            },
          },
          ...errors(400, 404, 409),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
          uploadID: z.string().min(1).meta({ description: "Upload ID" }),
        }),
      ),
      async (c) => {
        const params = c.req.valid("param")
        const session = await Session.get(params.sessionID)
        const dir = path.join(session.directory, ".tmp", "attachments")

        try {
          return c.json(await uploadAttachmentComplete(session.directory, params.uploadID, dir))
        } catch (error) {
          if (error instanceof AttachmentOffsetError) {
            return c.json({ message: error.message, received: error.received }, error.status)
          }
          if (error instanceof AttachmentError) {
            return c.json({ message: error.message }, error.status)
          }
          throw error
        }
      },
    )
    .delete(
      "/:sessionID/attachment/:uploadID",
      describeRoute({
        summary: "Cancel attachment upload",
        description: "Remove temporary files for an in-progress chunked attachment upload.",
        operationId: "session.attachment.cancel",
        responses: {
          200: {
            description: "Cancelled upload",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
          uploadID: z.string().min(1).meta({ description: "Upload ID" }),
        }),
      ),
      async (c) => {
        const params = c.req.valid("param")
        const session = await Session.get(params.sessionID)
        await attachmentUploadCleanup(session.directory, params.uploadID)
        return c.json(true)
      },
    )
    .post(
      "/:sessionID/attachment",
      describeRoute({
        summary: "Upload session attachment",
        description: "Upload a file to the session temporary attachments directory.",
        operationId: "session.attachment",
        responses: {
          200: {
            description: "Uploaded attachment",
            content: {
              "application/json": {
                schema: resolver(AttachmentUpload),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      async (c) => {
        const length = Number(c.req.header("content-length") ?? "0")
        const size = Number(c.req.header("x-opencode-attachment-size") ?? "0")
        if (size > ATTACHMENT_MAX_BYTES || length > ATTACHMENT_MAX_BYTES + 1024 * 1024) {
          return c.json({ message: "Attachment exceeds the 500MB limit" }, 413)
        }

        const session = await Session.get(c.req.valid("param").sessionID)
        const dir = path.join(session.directory, ".tmp", "attachments")

        await fs.mkdir(dir, { recursive: true })
        try {
          const result = await uploadAttachment(c.req.raw, dir)
          return c.json(result)
        } catch (error) {
          if (error instanceof AttachmentError) {
            return c.json({ message: error.message }, error.status)
          }
          throw error
        }
      },
    )
    .post(
      "/:sessionID/init",
      describeRoute({
        summary: "Initialize session",
        description:
          "Analyze the current application and create an AGENTS.md file with project-specific agent configurations.",
        operationId: "session.init",
        responses: {
          200: {
            description: "200",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      validator("json", Session.initialize.schema.omit({ sessionID: true })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")
        await Session.initialize({ ...body, sessionID })
        return c.json(true)
      },
    )
    .post(
      "/:sessionID/fork",
      describeRoute({
        summary: "Fork session",
        description: "Create a new session by forking an existing session at a specific message point.",
        operationId: "session.fork",
        responses: {
          200: {
            description: "200",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: Session.fork.schema.shape.sessionID,
        }),
      ),
      validator("json", Session.fork.schema.omit({ sessionID: true })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")
        const result = await Session.fork({ ...body, sessionID })
        return c.json(result)
      },
    )
    .post(
      "/:sessionID/abort",
      describeRoute({
        summary: "Abort session",
        description: "Abort an active session and stop any ongoing AI processing or command execution.",
        operationId: "session.abort",
        responses: {
          200: {
            description: "Aborted session",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const session = await Session.get(sessionID)
        if (session.directory === Instance.directory) {
          SessionPrompt.cancel(sessionID)
          return c.json(true)
        }
        await Instance.provide({
          directory: session.directory,
          fn: () => {
            SessionPrompt.cancel(sessionID)
          },
        })
        return c.json(true)
      },
    )
    .post(
      "/:sessionID/share",
      describeRoute({
        summary: "Share session",
        description: "Create a shareable link for a session, allowing others to view the conversation.",
        operationId: "session.share",
        responses: {
          200: {
            description: "Successfully shared session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        await Session.share(sessionID)
        const session = await Session.get(sessionID)
        return c.json(session)
      },
    )
    .delete(
      "/:sessionID/share",
      describeRoute({
        summary: "Unshare session",
        description: "Remove the shareable link for a session, making it private again.",
        operationId: "session.unshare",
        responses: {
          200: {
            description: "Successfully unshared session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: Session.unshare.schema,
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        await Session.unshare(sessionID)
        const session = await Session.get(sessionID)
        return c.json(session)
      },
    )
    .post(
      "/:sessionID/summarize",
      describeRoute({
        summary: "Summarize session",
        description: "Generate a concise summary of the session using AI compaction to preserve key information.",
        operationId: "session.summarize",
        responses: {
          200: {
            description: "Summarized session",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      validator(
        "json",
        z.object({
          providerID: z.string(),
          modelID: z.string(),
          auto: z.boolean().optional().default(false),
        }),
      ),
      async (c) => {
        User.requireFeature("models")
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")
        User.requireModel({ providerID: body.providerID, modelID: body.modelID })
        const session = await Session.get(sessionID)
        await SessionRevert.cleanup(session)
        const msgs = await Session.messages({ sessionID })
        let currentAgent = await Agent.defaultAgent()
        for (let i = msgs.length - 1; i >= 0; i--) {
          const info = msgs[i].info
          if (info.role === "user") {
            currentAgent = info.agent || (await Agent.defaultAgent())
            break
          }
        }
        await SessionCompaction.create({
          sessionID,
          agent: currentAgent,
          model: {
            providerID: body.providerID,
            modelID: body.modelID,
          },
          auto: body.auto,
        })
        await SessionPrompt.loop(sessionID)
        return c.json(true)
      },
    )
    .get(
      "/:sessionID/message",
      describeRoute({
        summary: "Get session messages",
        description: "Retrieve all messages in a session, including user prompts and AI responses.",
        operationId: "session.messages",
        responses: {
          200: {
            description: "List of messages",
            content: {
              "application/json": {
                schema: resolver(MessageV2.WithParts.array()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      validator(
        "query",
        z.object({
          limit: z.coerce.number().optional(),
        }),
      ),
      async (c) => {
        const query = c.req.valid("query")
        await requireParticipant(c.req.valid("param").sessionID)
        const messages = await Session.messages({
          sessionID: c.req.valid("param").sessionID,
          limit: query.limit,
        })
        return c.json(messages)
      },
    )
    .get(
      "/:sessionID/mentions",
      describeRoute({
        summary: "Get room mentions",
        description: "Retrieve structured and text mentions in a project room thread.",
        operationId: "session.room.mentions",
        responses: {
          200: {
            description: "Mentions",
            content: {
              "application/json": {
                schema: resolver(MentionInfo.array()),
              },
            },
          },
          ...errors(400, 403, 404),
        },
      }),
      validator("param", z.object({ sessionID: z.string().meta({ description: "Session ID" }) })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        await requireParticipant(sessionID)
        const roleLabels = new Set(["pm", "dev", "qa", "design"])
        const mentions = (await Session.messages({ sessionID })).flatMap((msg) =>
          msg.parts.flatMap((part) => {
            if (part.type === "mention") {
              return [
                {
                  sessionID,
                  messageID: msg.info.id,
                  targetType: part.targetType,
                  targetID: part.targetID,
                  label: part.label,
                  created: msg.info.time.created,
                },
              ]
            }
            if (part.type !== "text") return []
            return Array.from(part.text.matchAll(/(^|\s)@([A-Za-z0-9._-]+)/g)).map((match) => {
              const label = match[2]
              return {
                sessionID,
                messageID: msg.info.id,
                targetType:
                  label.toLowerCase() === "agent" ? "agent" : roleLabels.has(label.toLowerCase()) ? "role" : "user",
                label,
                created: msg.info.time.created,
              } satisfies z.infer<typeof MentionInfo>
            })
          }),
        )
        return c.json(mentions)
      },
    )
    .post(
      "/:sessionID/decision",
      describeRoute({
        summary: "Add room decision",
        description: "Add a structured decision to a project room thread.",
        operationId: "session.room.decision.add",
        responses: {
          200: {
            description: "Updated session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 403, 404),
        },
      }),
      validator("param", z.object({ sessionID: z.string().meta({ description: "Session ID" }) })),
      validator("json", Session.DecisionInput),
      async (c) => {
        return c.json(
          await Session.addDecision({
            sessionID: c.req.valid("param").sessionID,
            decision: c.req.valid("json"),
          }),
        )
      },
    )
    .get(
      "/:sessionID/decision",
      describeRoute({
        summary: "Get room decisions",
        description: "Retrieve structured decisions for a project room thread.",
        operationId: "session.room.decision.list",
        responses: {
          200: {
            description: "Decisions",
            content: {
              "application/json": {
                schema: resolver(Session.Info.shape.decisions.unwrap()),
              },
            },
          },
          ...errors(400, 403, 404),
        },
      }),
      validator("param", z.object({ sessionID: z.string().meta({ description: "Session ID" }) })),
      async (c) => {
        return c.json(await Session.decisions(c.req.valid("param").sessionID))
      },
    )
    .post(
      "/:sessionID/execution",
      describeRoute({
        summary: "Create execution session",
        description: "Create a child execution session from a project room thread.",
        operationId: "session.room.execution",
        responses: {
          200: {
            description: "Execution session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 403, 404),
        },
      }),
      validator("param", z.object({ sessionID: z.string().meta({ description: "Session ID" }) })),
      validator("json", z.object({ title: z.string().optional() }).optional()),
      async (c) => {
        return c.json(
          await Session.createExecution({
            sessionID: c.req.valid("param").sessionID,
            title: c.req.valid("json")?.title,
          }),
        )
      },
    )
    .get(
      "/:sessionID/message/:messageID",
      describeRoute({
        summary: "Get message",
        description: "Retrieve a specific message from a session by its message ID.",
        operationId: "session.message",
        responses: {
          200: {
            description: "Message",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    info: MessageV2.Info,
                    parts: MessageV2.Part.array(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
          messageID: z.string().meta({ description: "Message ID" }),
        }),
      ),
      async (c) => {
        const params = c.req.valid("param")
        await requireParticipant(params.sessionID)
        const message = await MessageV2.get({
          sessionID: params.sessionID,
          messageID: params.messageID,
        })
        return c.json(message)
      },
    )
    .delete(
      "/:sessionID/message/:messageID/part/:partID",
      describeRoute({
        description: "Delete a part from a message",
        operationId: "part.delete",
        responses: {
          200: {
            description: "Successfully deleted part",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
          messageID: z.string().meta({ description: "Message ID" }),
          partID: z.string().meta({ description: "Part ID" }),
        }),
      ),
      async (c) => {
        const params = c.req.valid("param")
        await Session.removePart({
          sessionID: params.sessionID,
          messageID: params.messageID,
          partID: params.partID,
        })
        return c.json(true)
      },
    )
    .patch(
      "/:sessionID/message/:messageID/part/:partID",
      describeRoute({
        description: "Update a part in a message",
        operationId: "part.update",
        responses: {
          200: {
            description: "Successfully updated part",
            content: {
              "application/json": {
                schema: resolver(MessageV2.Part),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
          messageID: z.string().meta({ description: "Message ID" }),
          partID: z.string().meta({ description: "Part ID" }),
        }),
      ),
      validator("json", MessageV2.Part),
      async (c) => {
        const params = c.req.valid("param")
        const body = c.req.valid("json")
        if (body.id !== params.partID || body.messageID !== params.messageID || body.sessionID !== params.sessionID) {
          throw new Error(
            `Part mismatch: body.id='${body.id}' vs partID='${params.partID}', body.messageID='${body.messageID}' vs messageID='${params.messageID}', body.sessionID='${body.sessionID}' vs sessionID='${params.sessionID}'`,
          )
        }
        const part = await Session.updatePart(body)
        return c.json(part)
      },
    )
    .post(
      "/:sessionID/message",
      describeRoute({
        summary: "Send message",
        description: "Create and send a new message to a session, streaming the AI response.",
        operationId: "session.prompt",
        responses: {
          200: {
            description: "Created message",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    info: MessageV2.Assistant,
                    parts: MessageV2.Part.array(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      validator("json", SessionPrompt.PromptInput.omit({ sessionID: true })),
      async (c) => {
        c.status(200)
        c.header("Content-Type", "application/json")
        return stream(c, async (stream) => {
          const sessionID = c.req.valid("param").sessionID
          const body = c.req.valid("json")
          const msg = await SessionPrompt.prompt({ ...body, sessionID })
          stream.write(JSON.stringify(msg))
        })
      },
    )
    .post(
      "/:sessionID/prompt_async",
      describeRoute({
        summary: "Send async message",
        description:
          "Create and send a new message to a session asynchronously, starting the session if needed and returning immediately.",
        operationId: "session.prompt_async",
        responses: {
          204: {
            description: "Prompt accepted",
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      validator("json", SessionPrompt.PromptInput.omit({ sessionID: true })),
      async (c) => {
        c.status(204)
        c.header("Content-Type", "application/json")
        return stream(c, async () => {
          const sessionID = c.req.valid("param").sessionID
          const body = c.req.valid("json")
          SessionPrompt.prompt({ ...body, sessionID })
        })
      },
    )
    .post(
      "/:sessionID/command",
      describeRoute({
        summary: "Send command",
        description: "Send a new command to a session for execution by the AI assistant.",
        operationId: "session.command",
        responses: {
          200: {
            description: "Created message",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    info: MessageV2.Assistant,
                    parts: MessageV2.Part.array(),
                  }),
                ),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      validator("json", SessionPrompt.CommandInput.omit({ sessionID: true })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")
        const msg = await SessionPrompt.command({ ...body, sessionID })
        return c.json(msg)
      },
    )
    .post(
      "/:sessionID/shell",
      describeRoute({
        summary: "Run shell command",
        description: "Execute a shell command within the session context and return the AI's response.",
        operationId: "session.shell",
        responses: {
          200: {
            description: "Created message",
            content: {
              "application/json": {
                schema: resolver(MessageV2.Assistant),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string().meta({ description: "Session ID" }),
        }),
      ),
      validator("json", SessionPrompt.ShellInput.omit({ sessionID: true })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const body = c.req.valid("json")
        const msg = await SessionPrompt.shell({ ...body, sessionID })
        return c.json(msg)
      },
    )
    .post(
      "/:sessionID/revert",
      describeRoute({
        summary: "Revert message",
        description: "Revert a specific message in a session, undoing its effects and restoring the previous state.",
        operationId: "session.revert",
        responses: {
          200: {
            description: "Updated session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
        }),
      ),
      validator("json", SessionRevert.RevertInput.omit({ sessionID: true })),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        log.info("revert", c.req.valid("json"))
        const session = await SessionRevert.revert({
          sessionID,
          ...c.req.valid("json"),
        })
        return c.json(session)
      },
    )
    .post(
      "/:sessionID/unrevert",
      describeRoute({
        summary: "Restore reverted messages",
        description: "Restore all previously reverted messages in a session.",
        operationId: "session.unrevert",
        responses: {
          200: {
            description: "Updated session",
            content: {
              "application/json": {
                schema: resolver(Session.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
        }),
      ),
      async (c) => {
        const sessionID = c.req.valid("param").sessionID
        const session = await SessionRevert.unrevert({ sessionID })
        return c.json(session)
      },
    )
    .post(
      "/:sessionID/permissions/:permissionID",
      describeRoute({
        summary: "Respond to permission",
        deprecated: true,
        description: "Approve or deny a permission request from the AI assistant.",
        operationId: "permission.respond",
        responses: {
          200: {
            description: "Permission processed successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          sessionID: z.string(),
          permissionID: z.string(),
        }),
      ),
      validator("json", z.object({ response: PermissionNext.Reply })),
      async (c) => {
        const params = c.req.valid("param")
        await PermissionNext.reply({
          sessionID: params.sessionID,
          requestID: params.permissionID,
          reply: c.req.valid("json").response,
        })
        return c.json(true)
      },
    ),
)
