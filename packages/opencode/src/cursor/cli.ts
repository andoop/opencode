import { createInterface } from "readline"
import { spawn } from "child_process"
import type { ModelMessage } from "ai"
import { Log } from "@/util/log"
import { bridgeCommand, bridgeToolNames, prefixTool } from "./bridge"
import { Installation } from "@/installation"
import { CursorToolCall, instructions, parse, surface, toolPrompt } from "./toolcall"
import { Identifier } from "@/id/id"
import { addPromptUsage, extractPromptUsageInfo, type PromptUsage } from "@/util/prompt-usage"

const log = Log.create({ service: "cursor-cli" })

function truncate(text: string, max: number) {
  if (text.length <= max) return text
  return text.slice(0, max) + "…"
}

function classifyCursorFailure(message: string) {
  const m = message.toLowerCase()
  if (m.includes("resource_exhausted")) return "resource_exhausted"
  if (m.includes("aborted") || m.includes("abort")) return "aborted"
  return "other"
}

function listKeys(input: unknown, max = 8) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return ""
  return Object.keys(input).slice(0, max).join(",")
}

function textLength(input: unknown) {
  return textFromContent(input).length
}

function oneLine(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

type StreamEvent =
  | { type: "start" }
  | { type: "start-step" }
  | { type: "text-start"; id: string; providerMetadata?: Record<string, unknown> }
  | { type: "text-delta"; id: string; text: string; providerMetadata?: Record<string, unknown> }
  | { type: "text-end"; id: string; providerMetadata?: Record<string, unknown> }
  | { type: "reasoning-start"; id: string; providerMetadata?: Record<string, unknown> }
  | { type: "reasoning-delta"; id: string; text: string; providerMetadata?: Record<string, unknown> }
  | { type: "reasoning-end"; id: string; providerMetadata?: Record<string, unknown> }
  | { type: "tool-input-start"; id: string; toolName: string }
  | {
      type: "tool-call"
      toolCallId: string
      toolName: string
      input: unknown
      providerMetadata?: Record<string, unknown>
    }
  | {
      type: "tool-result"
      toolCallId: string
      input?: unknown
      output: {
        title: string
        output: string
        metadata: Record<string, unknown>
      }
    }
  | { type: "tool-error"; toolCallId: string; input?: unknown; error: Error }
  | {
      type: "finish-step"
      finishReason: string
      usage: {
        inputTokens: number
        outputTokens: number
        totalTokens: number
        reasoningTokens: number
      }
      providerMetadata?: Record<string, unknown>
    }
  | { type: "finish" }
  | { type: "error"; error: Error }

type StreamOutput = {
  text: Promise<string>
  fullStream: AsyncIterable<StreamEvent>
}

class Queue<T> implements AsyncIterable<T> {
  private values: T[] = []
  private done = false
  private error: Error | undefined
  private waits: Array<(result: IteratorResult<T>) => void> = []

  push(value: T) {
    const next = this.waits.shift()
    if (next) {
      next({ value, done: false })
      return
    }
    this.values.push(value)
  }

  finish() {
    this.done = true
    for (const next of this.waits.splice(0)) {
      next({ value: undefined as T, done: true })
    }
  }

  fail(error: Error) {
    this.error = error
    this.done = true
    for (const next of this.waits.splice(0)) {
      next({ value: undefined as T, done: true })
    }
  }

  async next(): Promise<IteratorResult<T>> {
    if (this.values.length > 0) {
      return {
        value: this.values.shift()!,
        done: false,
      }
    }
    if (this.error) throw this.error
    if (this.done) {
      return {
        value: undefined as T,
        done: true,
      }
    }
    return new Promise((resolve) => {
      this.waits.push(resolve)
    })
  }

  [Symbol.asyncIterator]() {
    return this
  }
}

function renderContent(content: ModelMessage["content"]): string {
  if (typeof content === "string") return content
  return content
    .map((part) => {
      switch (part.type) {
        case "text":
          return part.text
        case "reasoning":
          return `<reasoning>\n${part.text}\n</reasoning>`
        case "file":
          const file = part as { url?: unknown; data?: unknown; filename?: string; mediaType?: string }
          const value = typeof file.url === "string" ? file.url : typeof file.data === "string" ? file.data : ""
          if (value.startsWith("data:")) {
            const comma = value.indexOf(",")
            const bytes = comma === -1 ? value.length : value.length - comma - 1
            return `<file name="${file.filename ?? "attachment"}" mime="${file.mediaType}" encoded_bytes="${bytes}">\nData URL content omitted from Cursor CLI transcript.\n</file>`
          }
          return `<file name="${file.filename ?? "attachment"}" mime="${file.mediaType}">\n${value}\n</file>`
        case "tool-call":
          return `<tool_call name="${part.toolName}">\n${part.input}\n</tool_call>`
        case "tool-result":
          return `<tool_result name="${part.toolName}">\n${typeof part.output === "string" ? part.output : JSON.stringify(part.output)}\n</tool_result>`
        default:
          return JSON.stringify(part)
      }
    })
    .join("\n")
}

async function serializePrompt(input: {
  system: string[]
  messages: ModelMessage[]
  localToolsFull: string
  localToolsReminder: string
}) {
  const prompt = [] as string[]
  if (input.system.length > 0 || input.localToolsFull) {
    prompt.push("<system>")
    if (input.system.length > 0) prompt.push(input.system.join("\n\n"))
    if (input.localToolsFull) prompt.push(input.localToolsFull)
    prompt.push("</system>")
  }
  prompt.push("The following transcript is the full conversation context for this turn.")
  for (const message of input.messages) {
    const rendered = renderContent(message.content)
    prompt.push(`<${message.role}>`)
    prompt.push(rendered)
    prompt.push(`</${message.role}>`)
  }
  if (input.localToolsReminder) prompt.push(input.localToolsReminder)
  prompt.push("Continue the conversation from the latest user request.")
  return prompt.join("\n\n")
}

function textFromContent(content: any): string {
  if (!content) return ""
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (item.type === "content") return textFromContent(item.content)
        if (item.type === "text") return item.text ?? ""
        if (item.type === "diff") return `Diff: ${item.path ?? ""}`
        if (item.type === "terminal") return `Terminal: ${item.terminalId ?? ""}`
        if (item.type === "resource") return item.resource?.text ?? item.resource?.uri ?? ""
        return JSON.stringify(item)
      })
      .filter(Boolean)
      .join("\n")
  }
  if (typeof content === "object") {
    if ("text" in content && typeof content.text === "string") return content.text
    if ("uri" in content && typeof content.uri === "string") return content.uri
  }
  return JSON.stringify(content)
}

function previewValue(input: unknown, max = 200) {
  const text = oneLine(textFromContent(input))
  return text ? truncate(text, max) : ""
}

function toolInput(update: any) {
  return (
    update.rawInput ??
    update.input ??
    update.arguments ??
    update.params?.arguments ??
    update.toolInput ??
    update.call?.arguments
  )
}

function toolOutput(update: any) {
  return update.content ?? update.rawOutput ?? update.output ?? update.result
}

function toolName(update: any) {
  const raw = update.rawInput
  if (raw && typeof raw === "object") {
    if (typeof raw.toolName === "string") return raw.toolName
    if (typeof raw.name === "string") return raw.name
    if (typeof raw.tool === "string") return raw.tool
  }
  if (typeof update.title === "string" && update.title) {
    return update.title.toLowerCase().replace(/[^a-z0-9_-]+/g, "_")
  }
  return "cursor_tool"
}

function finishReason(stopReason: string) {
  if (stopReason.includes("max_tokens")) return "length"
  if (stopReason.includes("cancel")) return "cancelled"
  return "stop"
}

function cursorPath() {
  return process.env.OPENCODE_CURSOR_CLI_PATH || Bun.which("agent")
}

type RpcPending = {
  resolve(value: any): void
  reject(error: Error): void
  method: string
}

type CursorStreamLog = {
  warn(message: string, extra?: Record<string, unknown>): void
  error(message: string, extra?: Record<string, unknown>): void
  info(message: string, extra?: Record<string, unknown>): void
}

type ToolTrace = {
  startedAt?: number
  updatedAt?: number
  status?: string
  title?: string
  rawInputKeys?: string
  inputPreview?: string
  contentPreview?: string
  rawOutputPreview?: string
  contentLen?: number
  rawOutputLen?: number
  updateCount?: number
}

type ToolWaiter = () => void

class Rpc {
  private nextId = 1
  private pending = new Map<number, RpcPending>()
  private sessions = new Set<string>()
  private closed = false
  private rl

  constructor(
    private proc: ReturnType<typeof spawn>,
    private onUpdate: (msg: any) => void,
    private slog: CursorStreamLog,
  ) {
    this.rl = createInterface({
      input: proc.stdout!,
    })
    this.rl.on("line", (line) => {
      if (!line.trim()) return
      let msg: any
      try {
        msg = JSON.parse(line)
      } catch {
        this.slog.warn("acp stdout not json", { preview: truncate(line, 240) })
        return
      }
      if (msg.method === "session/request_permission" && msg.id !== undefined && msg.id !== null) {
        this.slog.info("acp permission requested", {
          requestID: String(msg.id),
          options: (msg.params?.options ?? []).map((item: any) => `${item.optionId}:${item.kind ?? ""}`).join(","),
        })
        const option =
          msg.params?.options?.find((item: any) => item.kind?.startsWith("allow")) ?? msg.params?.options?.[0]
        this.slog.info("acp permission auto-selected", {
          requestID: String(msg.id),
          optionId: option?.optionId ?? "",
          optionKind: option?.kind ?? "",
        })
        this.respond(msg.id, {
          outcome: option
            ? {
                outcome: "selected",
                optionId: option.optionId,
              }
            : { outcome: "cancelled" },
        })
        return
      }
      if (
        (msg.result !== undefined || msg.error !== undefined) &&
        msg.id !== undefined &&
        msg.id !== null &&
        this.pending.has(msg.id)
      ) {
        const pending = this.pending.get(msg.id)!
        this.pending.delete(msg.id)
        if (msg.error) {
          const detail = msg.error.message ?? JSON.stringify(msg.error)
          this.slog.warn("acp rpc response error", {
            rpcMethod: pending.method,
            rpcError: truncate(detail, 480),
            failureKind: classifyCursorFailure(detail),
          })
          pending.reject(new Error(detail))
          return
        }
        pending.resolve(msg.result)
        return
      }
      this.onUpdate(msg)
    })
  }

  setUpdateHandler(handler: (msg: any) => void) {
    this.onUpdate = handler
  }

  request(method: string, params: Record<string, unknown>) {
    const id = this.nextId++
    this.proc.stdin?.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n")
    return new Promise<any>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method })
    })
  }

  notify(method: string, params: Record<string, unknown>) {
    this.proc.stdin?.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n")
  }

  respond(id: number, result: Record<string, unknown>) {
    this.proc.stdin?.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n")
  }

  trackSession(sessionId: string) {
    this.sessions.add(sessionId)
  }

  close() {
    if (this.closed) return
    this.closed = true
    if (this.pending.size > 0) {
      this.slog.warn("acp rpc closing with pending requests", {
        pendingCount: this.pending.size,
        pendingMethods: [...this.pending.values()].map((p) => p.method).join(","),
      })
    }
    for (const sessionId of this.sessions) {
      this.notify("session/cancel", { sessionId })
    }
    this.rl.close()
    this.proc.kill("SIGTERM")
  }
}

type CursorSession = {
  key: string
  proc: ReturnType<typeof spawn>
  rpc: Rpc
  cursorSessionID: string
  bridgeReadyFile?: string
  idle?: ReturnType<typeof setTimeout>
}

const sessions = new Map<string, CursorSession>()
const SESSION_IDLE_MS = 2 * 60 * 1000

function closeSession(key: string) {
  const session = sessions.get(key)
  if (!session) return
  sessions.delete(key)
  if (session.idle) clearTimeout(session.idle)
  session.rpc.close()
}

function scheduleClose(session: CursorSession) {
  if (session.idle) clearTimeout(session.idle)
  session.idle = setTimeout(() => closeSession(session.key), SESSION_IDLE_MS)
  session.idle.unref?.()
}

export namespace CursorCLI {
  export function available() {
    return Boolean(cursorPath())
  }

  export async function stream(input: {
    sessionID: string
    assistantMessageID?: string
    modelID: string
    agent: string
    cwd: string
    system: string[]
    messages: ModelMessage[]
    abort: AbortSignal
    allowedTools: string[]
  }): Promise<StreamOutput> {
    const queue = new Queue<StreamEvent>()
    const chunks: string[] = []
    const bin = cursorPath()
    if (!bin) {
      throw new Error("Cursor CLI not found. Install it and ensure the `agent` command is available.")
    }

    const local = await surface({
      sessionID: input.sessionID,
      agent: input.agent,
      allowedTools: input.allowedTools,
    })
    const bridged = new Set(
      await bridgeToolNames({
        agent: input.agent,
        allowedTools: input.allowedTools,
      }),
    )
    const localMcpTools = Object.fromEntries(
      Object.entries(local)
        .map(([key, item]) => {
          const name = prefixTool(key)
          return [name, { ...item, name, toolName: key }] as const
        })
        .filter(([name]) => bridged.has(name)),
    )
    const bridge = bridgeCommand({
      cwd: input.cwd,
      sessionID: input.sessionID,
      agent: input.agent,
      allowedTools: input.allowedTools,
    })
    const mcpTools = Object.values(localMcpTools)
    const prompt = await serializePrompt({
      system: input.system,
      messages: input.messages,
      localToolsFull: instructions(mcpTools, "full"),
      localToolsReminder: instructions(mcpTools, "reminder"),
    })
    const cacheKey = JSON.stringify({
      sessionID: input.sessionID,
      cwd: input.cwd,
      agent: input.agent,
      modelID: input.modelID,
      allowedTools: input.allowedTools.toSorted(),
    })
    const cached = sessions.get(cacheKey)
    if (cached?.idle) clearTimeout(cached.idle)
    const proc =
      cached?.proc ??
      spawn(bin, ["acp"], {
        cwd: input.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
        },
      })
    const ctx = { sessionID: input.sessionID, modelID: input.modelID }
    const slog: CursorStreamLog = {
      warn: (m, e) => log.warn(m, { ...ctx, ...e }),
      error: (m, e) => log.error(m, { ...ctx, ...e }),
      info: (m, e) => log.info(m, { ...ctx, ...e }),
    }
    slog.info("cursor-cli stream init", {
      cwd: input.cwd,
      agent: input.agent,
      promptChars: prompt.length,
      allowedTools: input.allowedTools.join(","),
      bridgeCommand: bridge.command,
    })
    let stderrLines = 0
    const stderrMax = 10
    if (!cached && proc.stderr) {
      const errRl = createInterface({ input: proc.stderr })
      errRl.on("line", (line) => {
        const t = line.trim()
        if (!t) return
        stderrLines++
        if (stderrLines > stderrMax) return
        slog.warn("cursor agent stderr", { stderrLine: stderrLines, text: truncate(t, 500) })
      })
    }
    let textOpen = false
    let reasoningOpen = false
    let textChars = 0
    let reasoningChars = 0
    const streamStartedAt = Date.now()
    let closeStartedAt = 0
    let abortStartedAt = 0
    const seenToolInput = new Set<string>()
    const seenToolCall = new Set<string>()
    const settledToolCalls = new Set<string>()
    const toolInputs = new Map<string, unknown>()
    const toolNames = new Map<string, string>()
    const toolTrace = new Map<string, ToolTrace>()
    const seenUpdateKinds = new Set<string>()
    const toolUpdateCounts = new Map<string, number>()
    const toolLastStatus = new Map<string, string>()
    const toolWaiters = new Set<ToolWaiter>()
    const recentUpdates: string[] = []
    let roundText = ""
    let roundReasoning = ""
    let roundNativeToolActivity = false
    let textBuffered = false
    let streamedUpTo = 0
    let promptUsage: PromptUsage | undefined
    let promptProviderMetadata: Record<string, unknown> | undefined
    let stepUsage: PromptUsage | undefined
    let stepProviderMetadata: Record<string, unknown> | undefined
    function rememberUsage(value: unknown) {
      const result = extractPromptUsageInfo(value)
      if (!result) return
      if (!stepUsage || result.usage.totalTokens >= stepUsage.totalTokens) {
        stepUsage = result.usage
      }
      if (result.providerMetadata) stepProviderMetadata = result.providerMetadata
    }
    function trace(id: string) {
      const item = toolTrace.get(id) ?? {}
      toolTrace.set(id, item)
      return item
    }

    function traceSummary(id: string) {
      const item = toolTrace.get(id)
      if (!item) return undefined
      return {
        toolName: toolNames.get(id) ?? "cursor_tool",
        status: item.status ?? "",
        title: item.title ?? "",
        updates: item.updateCount ?? 0,
        rawInputKeys: item.rawInputKeys ?? "",
        inputPreview: item.inputPreview ?? "",
        contentPreview: item.contentPreview ?? "",
        rawOutputPreview: item.rawOutputPreview ?? "",
        contentLen: item.contentLen ?? 0,
        rawOutputLen: item.rawOutputLen ?? 0,
        openForMs: item.startedAt ? Date.now() - item.startedAt : undefined,
        idleForMs: item.updatedAt ? Date.now() - item.updatedAt : undefined,
      }
    }

    function unsettledToolIDs() {
      return [...seenToolCall].filter((id) => !settledToolCalls.has(id))
    }

    function unsettledToolDetails() {
      return unsettledToolIDs().map((id) => ({ toolCallId: id, ...traceSummary(id) }))
    }

    function rememberUpdate(update: any) {
      recentUpdates.push(
        JSON.stringify({
          kind: String(update.sessionUpdate ?? "unknown"),
          toolCallId: update.toolCallId ?? "",
          toolName: update.toolName ?? toolName(update),
          status: update.status ?? "",
          title: update.title ?? "",
          input: previewValue(toolInput(update), 120),
          output: previewValue(toolOutput(update), 120),
        }),
      )
      if (recentUpdates.length > 12) recentUpdates.shift()
    }

    function notifyToolWaiters() {
      for (const item of [...toolWaiters]) item()
    }

    async function waitForTrailingToolUpdates(reason: string, quietMs = 2000, maxWaitMs = 6000) {
      const initial = unsettledToolIDs()
      if (initial.length === 0) return
      slog.warn("cursor-cli waiting for trailing tool updates", {
        reason,
        quietMs,
        maxWaitMs,
        unsettledTools: unsettledToolDetails(),
      })
      const startedAt = Date.now()
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer)
          toolWaiters.delete(check)
          resolve()
        }
        const check = () => {
          if (initial.every((id) => settledToolCalls.has(id))) done()
        }
        const timer = setTimeout(done, maxWaitMs)
        toolWaiters.add(check)
        check()
      })
      slog.info("cursor-cli trailing tool wait completed", {
        reason,
        waitedMs: Date.now() - startedAt,
        unsettledTools: unsettledToolDetails(),
        recentUpdates,
      })
    }

    function settleOpenToolCalls(reason: string) {
      for (const id of seenToolCall) {
        if (settledToolCalls.has(id)) continue
        settledToolCalls.add(id)
        const name = toolNames.get(id) ?? "cursor_tool"
        const trace = traceSummary(id)
        slog.warn("cursor-cli unfinished tool settled", {
          toolCallId: id,
          toolName: name,
          reason: truncate(reason, 200),
          trace,
        })
        queue.push({
          type: "tool-error",
          toolCallId: id,
          input: toolInputs.get(id),
          error: new Error(reason),
        })
      }
    }

    function logSessionUpdate(update: any) {
      const kind = String(update.sessionUpdate ?? "unknown")
      rememberUpdate(update)
      if (!seenUpdateKinds.has(kind)) {
        seenUpdateKinds.add(kind)
        slog.info("cursor session update kind", {
          kind,
          updateKeys: listKeys(update, 12),
        })
      }
      if (kind !== "tool_call" && kind !== "tool_call_update") {
        if (kind.includes("tool") || kind.includes("permission")) {
          slog.info("cursor session update detail", {
            kind,
            toolCallId: update.toolCallId ?? "",
            status: update.status ?? "",
            title: update.title ?? "",
          })
        }
        return
      }
      const id = String(update.toolCallId ?? "")
      const count = (toolUpdateCounts.get(id) ?? 0) + 1
      toolUpdateCounts.set(id, count)
      const item = trace(id)
      item.updateCount = count
      item.updatedAt = Date.now()
      const status = typeof update.status === "string" ? update.status : ""
      if (!item.startedAt) item.startedAt = item.updatedAt
      if (status) item.status = status
      if (typeof update.title === "string" && update.title) item.title = update.title
      item.rawInputKeys = listKeys(toolInput(update))
      item.contentLen = textLength(update.content)
      item.rawOutputLen = textLength(toolOutput(update))
      item.contentPreview = previewValue(update.content)
      item.rawOutputPreview = previewValue(toolOutput(update))
      if (toolInput(update) !== undefined) item.inputPreview = previewValue(toolInput(update))
      const lastStatus = toolLastStatus.get(id)
      const shouldLog =
        kind === "tool_call" ||
        count <= 3 ||
        (status && status !== lastStatus) ||
        status === "completed" ||
        status === "failed"
      if (!shouldLog) return
      if (status) {
        toolLastStatus.set(id, status)
      }
      slog.info("cursor tool lifecycle", {
        kind,
        toolCallId: id,
        toolName: toolNames.get(id) ?? toolName(update),
        status,
        count,
        title: update.title ?? "",
        rawInputKeys: item.rawInputKeys ?? "",
        inputPreview: item.inputPreview ?? "",
        contentPreview: item.contentPreview ?? "",
        rawOutputPreview: item.rawOutputPreview ?? "",
        contentLen: item.contentLen ?? 0,
        rawOutputLen: item.rawOutputLen ?? 0,
      })
    }
    proc.on("exit", (code, signal) => {
      const unsettled = [...seenToolCall].filter((id) => !settledToolCalls.has(id))
      if (code === 0 || code === null) {
        if (unsettled.length === 0) return
      }
      slog.warn("cursor agent process exited", {
        exitCode: code ?? "",
        signal: signal ?? "",
        duration: Date.now() - streamStartedAt,
        textOpen,
        reasoningOpen,
        unsettledTools: unsettled.map((id) => ({ toolCallId: id, ...traceSummary(id) })),
      })
    })
    const textId = "cursor-text"
    const reasoningId = "cursor-reasoning"
    let bridgeUpdateAt = 0
    const bridgeUpdateWaiters = new Set<() => void>()
    const updateHandler = (msg: any) => {
      if (msg.method !== "session/update") return
      const update = msg.params?.update
      if (!update) return
      bridgeUpdateAt = Date.now()
      for (const waiter of bridgeUpdateWaiters) waiter()
      bridgeUpdateWaiters.clear()
      rememberUsage(update)
      logSessionUpdate(update)
      switch (update.sessionUpdate) {
        case "agent_message_chunk": {
          const text = textFromContent(update.content)
          if (!text) return
          roundText += text
          if (!textBuffered && roundText.includes(`<${CursorToolCall.TAG}`)) {
            textBuffered = true
            if (textOpen) {
              queue.push({ type: "text-end", id: textId })
              textOpen = false
            }
            return
          }
          if (textBuffered) return
          const tagOpen = `<${CursorToolCall.TAG}`
          let safe = roundText.length
          for (let i = Math.max(streamedUpTo, roundText.length - tagOpen.length); i < roundText.length; i++) {
            if (roundText[i] !== "<") continue
            if (tagOpen.startsWith(roundText.slice(i))) {
              safe = i
              break
            }
          }
          const delta = roundText.slice(streamedUpTo, safe)
          if (!delta) return
          streamedUpTo = safe
          if (!textOpen) {
            textOpen = true
            queue.push({ type: "text-start", id: textId })
          }
          queue.push({ type: "text-delta", id: textId, text: delta })
          textChars += delta.length
          return
        }
        case "agent_thought_chunk": {
          const text = textFromContent(update.content)
          if (!text) return
          roundReasoning += text
          if (!reasoningOpen) {
            reasoningOpen = true
            queue.push({ type: "reasoning-start", id: reasoningId })
          }
          queue.push({ type: "reasoning-delta", id: reasoningId, text })
          reasoningChars += text.length
          return
        }
        case "tool_call": {
          roundNativeToolActivity = true
          const id = update.toolCallId as string
          const name = toolName(update)
          toolNames.set(id, name)
          const item = trace(id)
          item.startedAt = item.startedAt ?? Date.now()
          item.updatedAt = Date.now()
          item.title = typeof update.title === "string" && update.title ? update.title : item.title
          item.rawInputKeys = listKeys(toolInput(update))
          if (!seenToolInput.has(id)) {
            seenToolInput.add(id)
            queue.push({ type: "tool-input-start", id, toolName: name })
          }
          if (toolInput(update) !== undefined) {
            toolInputs.set(id, toolInput(update))
            item.inputPreview = previewValue(toolInput(update))
          }
          return
        }
        case "tool_call_update": {
          roundNativeToolActivity = true
          const id = update.toolCallId as string
          const name = toolNames.get(id) ?? toolName(update)
          toolNames.set(id, name)
          if (!seenToolCall.has(id) && !toolInputs.has(id) && toolInput(update) === undefined) {
            slog.warn("cursor tool update missing initial input", {
              toolCallId: id,
              toolName: name,
              status: update.status ?? "",
            })
          }
          if (!seenToolInput.has(id)) {
            seenToolInput.add(id)
            queue.push({ type: "tool-input-start", id, toolName: name })
          }
          if (toolInput(update) !== undefined) {
            toolInputs.set(id, toolInput(update))
          }
          if (!seenToolCall.has(id) && toolInputs.has(id)) {
            seenToolCall.add(id)
            queue.push({
              type: "tool-call",
              toolCallId: id,
              toolName: name,
              input: toolInputs.get(id),
            })
          }
          if (update.status === "completed") {
            settledToolCalls.add(id)
            notifyToolWaiters()
            queue.push({
              type: "tool-result",
              toolCallId: id,
              input: toolInputs.get(id),
              output: {
                title: update.title ?? name,
                output: textFromContent(update.content) || textFromContent(toolOutput(update)),
                metadata: {},
              },
            })
          }
          if (update.status === "failed") {
            settledToolCalls.add(id)
            notifyToolWaiters()
            const toolErrMsg = textFromContent(update.content) || textFromContent(toolOutput(update)) || "Tool failed"
            slog.warn("cursor tool_call_update failed", {
              toolCallId: id,
              toolName: name,
              detail: truncate(toolErrMsg, 400),
              failureKind: classifyCursorFailure(toolErrMsg),
            })
            queue.push({
              type: "tool-error",
              toolCallId: id,
              input: toolInputs.get(id),
              error: new Error(toolErrMsg),
            })
          }
          return
        }
        default:
          return
      }
    }
    const rpc = cached?.rpc ?? new Rpc(proc, updateHandler, slog)
    rpc.setUpdateHandler(updateHandler)

    let streamFailed = false
    const abortHandler = () => {
      slog.info("cursor-cli stream aborted by client", {
        duration: Date.now() - streamStartedAt,
        unsettledTools: [...seenToolCall]
          .filter((id) => !settledToolCalls.has(id))
          .map((id) => ({
            toolCallId: id,
            ...traceSummary(id),
          })),
      })
      closeSession(cacheKey)
    }
    input.abort.addEventListener("abort", abortHandler, { once: true })
    const text = (async () => {
      try {
        function emitReasoning(text: string) {
          if (!text) return
          queue.push({ type: "reasoning-start", id: reasoningId })
          queue.push({ type: "reasoning-delta", id: reasoningId, text })
          queue.push({ type: "reasoning-end", id: reasoningId })
          reasoningChars += text.length
        }

        function emitText(text: string) {
          if (!text) return
          queue.push({ type: "text-start", id: textId })
          queue.push({ type: "text-delta", id: textId, text })
          queue.push({ type: "text-end", id: textId })
          textChars += text.length
          chunks.push(text)
        }

        function finish(done: string, reason = "stop") {
          settleOpenToolCalls(
            "Cursor ended the turn before this tool finished (common with terminal commands or disconnect).",
          )
          queue.push({
            type: "finish-step",
            finishReason: reason,
            usage: promptUsage ?? {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              reasoningTokens: 0,
            },
            providerMetadata: promptProviderMetadata,
          })
          queue.push({ type: "finish" })
          queue.finish()
          return done
        }

        queue.push({ type: "start" })
        queue.push({ type: "start-step" })
        let sessionId = cached?.cursorSessionID
        if (!cached) {
          const init = await rpc.request("initialize", {
            protocolVersion: 1,
            clientCapabilities: {
              fs: { readTextFile: false, writeTextFile: false },
              terminal: false,
            },
            clientInfo: {
              name: "opencode",
              version: Installation.VERSION,
            },
          })
          slog.info("cursor initialize completed", {
            authMethods: (init?.authMethods ?? []).map((item: any) => item.methodId).join(","),
          })
          const cursorLogin = init?.authMethods?.find((item: any) => item.methodId === "cursor_login")
          if (cursorLogin) {
            await rpc.request("authenticate", { methodId: "cursor_login" }).catch((error) => {
              log.debug("cursor authenticate failed", { error })
            })
          }
          const session = await rpc.request("session/new", {
            cwd: input.cwd,
            mcpServers: [
              {
                name: "OpenCode",
                command: bridge.command,
                args: bridge.args,
                env: Object.entries(bridge.env).map(([name, value]) => ({ name, value })),
              },
            ],
          })
          sessionId = session.sessionId as string
          rpc.trackSession(sessionId)
          slog.info("cursor session created", {
            cursorSessionID: sessionId,
            modes: (session.modes?.availableModes ?? []).map((m: any) => `${m.id}:${m.name}`).join(","),
            currentModeId: session.modes?.currentModeId ?? "",
          })
          const modes = session.modes?.availableModes as Array<{ id: string; name: string }> | undefined
          const target = modes?.find((m) => m.name === input.agent)
          if (target && target.id !== session.modes?.currentModeId) {
            slog.info("cursor session set mode", {
              cursorSessionID: sessionId,
              modeId: target.id,
              modeName: target.name,
            })
            await rpc.request("session/set_mode", {
              sessionId,
              modeId: target.id,
            })
          }
          // Wait for the MCP bridge subprocess to finish registering tools with Cursor.
          // Without this, Cursor's AI may not see opencode tools (like select/question)
          // because the bridge hasn't connected yet when the first prompt is sent.
          if (bridge.readyFile) {
            const bridgeStarted = Date.now()
            const deadline = bridgeStarted + 10_000
            let ready = false
            let update = bridgeUpdateAt > bridgeStarted
            while (!ready && !update && Date.now() < deadline) {
              ready = await Bun.file(bridge.readyFile).exists()
              if (ready) break
              let resolveUpdate: (() => void) | undefined
              await Promise.race([
                new Promise<void>((resolve) => {
                  resolveUpdate = resolve
                  bridgeUpdateWaiters.add(resolve)
                }),
                new Promise((resolve) => setTimeout(resolve, 100)),
              ])
              if (resolveUpdate) bridgeUpdateWaiters.delete(resolveUpdate)
              update = bridgeUpdateAt > bridgeStarted
            }
            if (ready) slog.info("cursor bridge ready", { waitedMs: Date.now() - bridgeStarted })
            Bun.file(bridge.readyFile)
              .unlink()
              .catch(() => {})
          }
          sessions.set(cacheKey, {
            key: cacheKey,
            proc,
            rpc,
            cursorSessionID: sessionId!,
            bridgeReadyFile: bridge.readyFile,
          })
          proc.once("exit", () => {
            if (sessions.get(cacheKey)?.proc === proc) sessions.delete(cacheKey)
          })
        }
        if (!sessionId) throw new Error("Cursor session was not initialized")

        let next = prompt
        let steps = 0
        while (true) {
          roundText = ""
          roundReasoning = ""
          roundNativeToolActivity = false
          textBuffered = false
          textOpen = false
          reasoningOpen = false
          streamedUpTo = 0
          stepUsage = undefined
          stepProviderMetadata = undefined
          if (steps > 0) {
            queue.push({ type: "start-step" })
          }
          slog.info("cursor session prompt start", {
            cursorSessionID: sessionId,
            promptChars: next.length,
            localSteps: steps,
          })
          const response = await rpc.request("session/prompt", {
            sessionId,
            prompt: [
              {
                type: "text",
                text: next,
              },
            ],
          })
          rememberUsage(response)
          promptUsage = addPromptUsage(promptUsage, stepUsage)
          if (stepProviderMetadata) promptProviderMetadata = stepProviderMetadata
          await waitForTrailingToolUpdates("session_prompt_completed")
          if (!textBuffered && streamedUpTo < roundText.length) {
            const remaining = roundText.slice(streamedUpTo)
            if (remaining) {
              if (!textOpen) {
                textOpen = true
                queue.push({ type: "text-start", id: textId })
              }
              queue.push({ type: "text-delta", id: textId, text: remaining })
              textChars += remaining.length
            }
          }
          if (reasoningOpen) {
            queue.push({ type: "reasoning-end", id: reasoningId })
            reasoningOpen = false
          }
          if (textOpen) {
            queue.push({ type: "text-end", id: textId })
            textOpen = false
          }
          const parsed = parse(roundText)
          if (parsed.calls.length > 0 || parsed.errors.length > 0) {
            if (parsed.text) chunks.push(parsed.text)
            const results = [] as Array<{ name: string; output: string; error?: boolean }>
            for (const item of parsed.errors) {
              const id = Identifier.ascending("tool")
              queue.push({ type: "tool-input-start", id, toolName: item.name })
              queue.push({
                type: "tool-error",
                toolCallId: id,
                input: undefined,
                error: new Error(item.error),
              })
              results.push({
                name: item.name,
                output: item.error,
                error: true,
              })
            }
            for (const item of parsed.calls) {
              const id = Identifier.ascending("tool")
              const tool = localMcpTools[item.name]
              queue.push({ type: "tool-input-start", id, toolName: item.name })
              queue.push({
                type: "tool-call",
                toolCallId: id,
                toolName: tool?.toolName ?? item.name,
                input: item.args,
              })
              if (!tool) {
                const error = new Error(`Unknown tool: ${item.name}`)
                queue.push({
                  type: "tool-error",
                  toolCallId: id,
                  input: item.args,
                  error,
                })
                results.push({
                  name: item.name,
                  output: error.message,
                  error: true,
                })
                continue
              }
              try {
                const result = await tool.execute(item.args, input.abort, {
                  callID: id,
                  messageID: input.assistantMessageID,
                })
                queue.push({
                  type: "tool-result",
                  toolCallId: id,
                  input: item.args,
                  output: {
                    title: result.title || item.name,
                    output: result.output,
                    metadata: result.metadata,
                  },
                })
                results.push({
                  name: item.name,
                  output: result.output,
                })
              } catch (error) {
                const err = error instanceof Error ? error : new Error(String(error))
                queue.push({
                  type: "tool-error",
                  toolCallId: id,
                  input: item.args,
                  error: err,
                })
                results.push({
                  name: item.name,
                  output: err.message,
                  error: true,
                })
              }
            }
            steps += 1
            if (steps >= CursorToolCall.STEP_MAX) {
              emitText("Cursor CLI tool loop reached the maximum number of tool steps.")
              return finish(chunks.join(""), "length")
            }
            next = toolPrompt(results)
            continue
          }
          if (roundNativeToolActivity) {
            const retries = [] as Array<{ name: string; args: Record<string, unknown> }>
            for (const [id] of toolInputs) {
              if (!settledToolCalls.has(id)) continue
              const raw = toolInputs.get(id)
              const cmd =
                raw && typeof raw === "object" && "command" in (raw as Record<string, unknown>)
                  ? String((raw as Record<string, unknown>).command)
                  : ""
              const cmdTool = cmd.split(/\s+/)[0]
              if (!cmdTool || !localMcpTools[cmdTool]) continue
              const t = toolTrace.get(id)
              const preview = (t?.rawOutputPreview ?? "") + (t?.contentPreview ?? "")
              if (preview.includes("command not found") || preview.includes("not recognized")) {
                retries.push({ name: cmdTool, args: {} })
              }
            }
            if (retries.length > 0) {
              const results = [] as Array<{ name: string; output: string; error?: boolean }>
              for (const item of retries) {
                const id = Identifier.ascending("tool")
                const tool = localMcpTools[item.name]!
                queue.push({ type: "tool-input-start", id, toolName: item.name })
                queue.push({ type: "tool-call", toolCallId: id, toolName: item.name, input: item.args })
                try {
                  const result = await tool.execute(item.args, input.abort, {
                    callID: id,
                    messageID: input.assistantMessageID,
                  })
                  queue.push({
                    type: "tool-result",
                    toolCallId: id,
                    input: item.args,
                    output: { title: result.title || item.name, output: result.output, metadata: result.metadata },
                  })
                  results.push({ name: item.name, output: result.output })
                } catch (error) {
                  const err = error instanceof Error ? error : new Error(String(error))
                  queue.push({ type: "tool-error", toolCallId: id, input: item.args, error: err })
                  results.push({ name: item.name, output: err.message, error: true })
                }
              }
              steps += 1
              if (steps >= CursorToolCall.STEP_MAX) {
                emitText("Cursor CLI tool loop reached the maximum number of tool steps.")
                return finish(chunks.join(""), "length")
              }
              next = toolPrompt(results)
              continue
            }
          }
          const unsettled = unsettledToolIDs()
          slog.info("cursor session prompt completed", {
            cursorSessionID: sessionId,
            stopReason: response?.stopReason ?? "",
            finishReason: finishReason(response?.stopReason ?? "end_turn"),
            duration: Date.now() - streamStartedAt,
            textChars,
            reasoningChars,
            toolCalls: seenToolCall.size,
            unsettledTools: unsettled.join(","),
            unsettledDetails: unsettledToolDetails(),
          })
          if (textBuffered) {
            emitText(parsed.text)
          } else if (roundText) {
            chunks.push(roundText)
          }
          return finish(chunks.join(""), finishReason(response?.stopReason ?? "end_turn"))
        }
      } catch (error) {
        streamFailed = true
        const err = error instanceof Error ? error : new Error(String(error))
        settleOpenToolCalls(truncate(`Stream ended before tool finished: ${err.message}`, 400))
        slog.error("cursor-cli stream failed", {
          failureKind: classifyCursorFailure(err.message),
          message: truncate(err.message, 600),
        })
        queue.push({ type: "error", error: err })
        queue.fail(err)
        throw err
      } finally {
        input.abort.removeEventListener("abort", abortHandler)
        if (streamFailed || input.abort.aborted) {
          closeSession(cacheKey)
        } else {
          rpc.setUpdateHandler(() => {})
          const session = sessions.get(cacheKey)
          if (session) scheduleClose(session)
        }
      }
    })()

    return {
      text,
      fullStream: queue,
    }
  }
}
