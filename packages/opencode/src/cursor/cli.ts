import { createInterface } from "readline"
import { spawn } from "child_process"
import type { ModelMessage } from "ai"
import { Log } from "@/util/log"
import { bridgeCommand, bridgeToolNames } from "./bridge"
import { Installation } from "@/installation"

const log = Log.create({ service: "cursor-cli" })

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
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown; providerMetadata?: Record<string, unknown> }
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
          return `<file name="${part.filename ?? "attachment"}" mime="${part.mediaType}">\n${String((part as any).url ?? (part as any).data ?? "")}\n</file>`
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

async function serializePrompt(input: { system: string[]; messages: ModelMessage[]; agent: string; allowedTools: string[] }) {
  const bridged = await bridgeToolNames({
    agent: input.agent,
    allowedTools: input.allowedTools,
  }).catch(() => [])
  const prompt = [] as string[]
  if (input.system.length > 0) {
    prompt.push("<system>")
    prompt.push(input.system.join("\n\n"))
    prompt.push("</system>")
  }
  if (bridged.length > 0) {
    prompt.push(
      [
        "Additional OpenCode tools are available through MCP.",
        "Their names are prefixed with `opencode_`.",
        `Available bridged tools: ${bridged.join(", ")}`,
      ].join("\n"),
    )
  }
  prompt.push("The following transcript is the full conversation context for this turn.")
  for (const message of input.messages) {
    prompt.push(`<${message.role}>`)
    prompt.push(renderContent(message.content))
    prompt.push(`</${message.role}>`)
  }
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

class Rpc {
  private nextId = 1
  private pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>()
  private sessions = new Set<string>()
  private rl

  constructor(
    private proc: ReturnType<typeof spawn>,
    private onUpdate: (msg: any) => void,
  ) {
    this.rl = createInterface({
      input: proc.stdout!,
    })
    this.rl.on("line", (line) => {
      if (!line.trim()) return
      const msg = JSON.parse(line)
      if (msg.id !== undefined && msg.id !== null && this.pending.has(msg.id)) {
        const pending = this.pending.get(msg.id)!
        this.pending.delete(msg.id)
        if (msg.error) {
          pending.reject(new Error(msg.error.message ?? JSON.stringify(msg.error)))
          return
        }
        pending.resolve(msg.result)
        return
      }
      if (msg.method === "session/request_permission" && msg.id !== undefined && msg.id !== null) {
        const option = msg.params?.options?.find((item: any) => item.kind?.startsWith("allow")) ?? msg.params?.options?.[0]
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
      this.onUpdate(msg)
    })
  }

  request(method: string, params: Record<string, unknown>) {
    const id = this.nextId++
    this.proc.stdin?.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n")
    return new Promise<any>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
  }

  notify(method: string, params: Record<string, unknown>) {
    this.proc.stdin?.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n")
  }

  respond(id: number, result: Record<string, unknown>) {
    this.proc.stdin?.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n")
  }

  close() {
    for (const sessionId of this.sessions) {
      this.notify("session/cancel", { sessionId })
    }
    this.rl.close()
    this.proc.kill("SIGTERM")
  }
}

export namespace CursorCLI {
  export function available() {
    return Boolean(cursorPath())
  }

  export async function stream(input: {
    sessionID: string
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

    const bridge = bridgeCommand({
      cwd: input.cwd,
      sessionID: input.sessionID,
      agent: input.agent,
      allowedTools: input.allowedTools,
    })
    const prompt = await serializePrompt({
      system: input.system,
      messages: input.messages,
      agent: input.agent,
      allowedTools: input.allowedTools,
    })
    const proc = spawn(bin, ["acp"], {
      cwd: input.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
      },
    })
    let textOpen = false
    let reasoningOpen = false
    const seenToolInput = new Set<string>()
    const seenToolCall = new Set<string>()
    const toolInputs = new Map<string, unknown>()
    const toolNames = new Map<string, string>()
    const textId = "cursor-text"
    const reasoningId = "cursor-reasoning"
    const rpc = new Rpc(proc, (msg) => {
      if (msg.method !== "session/update") return
      const update = msg.params?.update
      if (!update) return
      switch (update.sessionUpdate) {
        case "agent_message_chunk": {
          const text = textFromContent(update.content)
          if (!text) return
          if (!textOpen) {
            textOpen = true
            queue.push({ type: "text-start", id: textId })
          }
          chunks.push(text)
          queue.push({ type: "text-delta", id: textId, text })
          return
        }
        case "agent_thought_chunk": {
          const text = textFromContent(update.content)
          if (!text) return
          if (!reasoningOpen) {
            reasoningOpen = true
            queue.push({ type: "reasoning-start", id: reasoningId })
          }
          queue.push({ type: "reasoning-delta", id: reasoningId, text })
          return
        }
        case "tool_call": {
          const id = update.toolCallId as string
          const name = toolName(update)
          toolNames.set(id, name)
          if (!seenToolInput.has(id)) {
            seenToolInput.add(id)
            queue.push({ type: "tool-input-start", id, toolName: name })
          }
          if (update.rawInput !== undefined) {
            toolInputs.set(id, update.rawInput)
          }
          return
        }
        case "tool_call_update": {
          const id = update.toolCallId as string
          const name = toolNames.get(id) ?? toolName(update)
          toolNames.set(id, name)
          if (!seenToolInput.has(id)) {
            seenToolInput.add(id)
            queue.push({ type: "tool-input-start", id, toolName: name })
          }
          if (update.rawInput !== undefined) {
            toolInputs.set(id, update.rawInput)
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
            queue.push({
              type: "tool-result",
              toolCallId: id,
              input: toolInputs.get(id),
              output: {
                title: update.title ?? name,
                output: textFromContent(update.content) || textFromContent(update.rawOutput),
                metadata: {},
              },
            })
          }
          if (update.status === "failed") {
            queue.push({
              type: "tool-error",
              toolCallId: id,
              input: toolInputs.get(id),
              error: new Error(textFromContent(update.content) || textFromContent(update.rawOutput) || "Tool failed"),
            })
          }
          return
        }
        default:
          return
      }
    })

    const text = (async () => {
      try {
        queue.push({ type: "start" })
        queue.push({ type: "start-step" })
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
        const sessionId = session.sessionId as string
        const response = await rpc.request("session/prompt", {
          sessionId,
          prompt: [
            {
              type: "text",
              text: prompt,
            },
          ],
        })
        if (reasoningOpen) {
          reasoningOpen = false
          queue.push({ type: "reasoning-end", id: reasoningId })
        }
        if (textOpen) {
          textOpen = false
          queue.push({ type: "text-end", id: textId })
        }
        queue.push({
          type: "finish-step",
          finishReason: finishReason(response.stopReason ?? "end_turn"),
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            reasoningTokens: 0,
          },
        })
        queue.push({ type: "finish" })
        queue.finish()
        return chunks.join("")
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        queue.push({ type: "error", error: err })
        queue.fail(err)
        throw err
      } finally {
        rpc.close()
      }
    })()

    input.abort.addEventListener(
      "abort",
      () => {
        rpc.close()
      },
      { once: true },
    )

    return {
      text,
      fullStream: queue,
    }
  }
}
