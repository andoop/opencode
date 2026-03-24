import { Agent } from "@/agent/agent"
import { Identifier } from "@/id/id"
import { MCP } from "@/mcp"
import { PermissionNext } from "@/permission/next"
import { Plugin } from "@/plugin"
import { Session } from "@/session"
import { ListTool } from "@/tool/ls"
import { Tool } from "@/tool/tool"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncation"
import { z } from "zod"

const NATIVE = new Set([
  "bash",
  "read",
  "glob",
  "grep",
  "edit",
  "write",
  "apply_patch",
  "webfetch",
  "websearch",
  "codesearch",
  "ls",
])

const TAG = "opencode_tool_call"
const RESULT = "opencode_tool_result"
const ERROR = "opencode_tool_error"
const STEP_MAX = 12

export type CursorTool = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute(args: Record<string, unknown>, abort: AbortSignal): Promise<{
    title: string
    output: string
    metadata: Record<string, unknown>
  }>
}

export type ParsedToolCall = {
  name: string
  args: Record<string, unknown>
}

export type ParsedToolError = {
  name: string
  error: string
}

export type ParsedToolCalls = {
  text: string
  calls: ParsedToolCall[]
  errors: ParsedToolError[]
}

function stripFence(text: string) {
  const trimmed = text.trim()
  if (!trimmed.startsWith("```")) return trimmed
  return trimmed.replace(/^```[a-zA-Z0-9_-]*\s*/, "").replace(/\s*```$/, "").trim()
}

function stringifySchema(input: Record<string, unknown>) {
  return JSON.stringify(input)
}

function stringifyResult(tag: string, name: string, body: string) {
  return `<${tag} name="${name}">\n${body}\n</${tag}>`
}

async function ask(input: {
  sessionID: string
  agent: string
  permission: string
  callID: string
  messageID: string
}) {
  const agent = await Agent.get(input.agent)
  const session = await Session.get(input.sessionID).catch(() => undefined)
  await PermissionNext.ask({
    sessionID: input.sessionID,
    permission: input.permission,
    metadata: {},
    patterns: ["*"],
    always: ["*"],
    tool: {
      messageID: input.messageID,
      callID: input.callID,
    },
    ruleset: PermissionNext.merge(agent.permission, session?.permission ?? []),
  })
}

function renderMcpContent(content: Array<Record<string, unknown>>) {
  const text = [] as string[]
  for (const item of content) {
    if (item.type === "text") {
      text.push(String(item.text ?? ""))
      continue
    }
    if (item.type === "resource" && item.resource && typeof item.resource === "object") {
      const resource = item.resource as { text?: string; uri?: string }
      if (typeof resource.text === "string") text.push(resource.text)
      if (typeof resource.uri === "string" && !resource.text) text.push(resource.uri)
      continue
    }
    if (item.type === "image") {
      text.push("[image omitted]")
      continue
    }
  }
  return text.join("\n\n").trim()
}

export async function surface(input: { sessionID: string; agent: string; allowedTools: string[] }) {
  const allowed = new Set(input.allowedTools)
  const agent = await Agent.get(input.agent)
  const out: Record<string, CursorTool> = {}

  for (const item of await ToolRegistry.tools({ providerID: "cursor-cli", modelID: "auto" }, agent)) {
    if (!NATIVE.has(item.id)) continue
    if (allowed.size > 0 && !allowed.has(item.id)) continue
    out[item.id] = {
      name: item.id,
      description: item.description,
      inputSchema: z.toJSONSchema(item.parameters) as Record<string, unknown>,
      async execute(args, abort) {
        const callID = Identifier.ascending("tool")
        const messageID = Identifier.ascending("message")
        await Plugin.trigger(
          "tool.execute.before",
          { tool: item.id, sessionID: input.sessionID, callID },
          { args },
        )
        const result = await item.execute(args, {
          sessionID: input.sessionID,
          messageID,
          agent: input.agent,
          abort,
          callID,
          messages: [],
          metadata() {},
          async ask(req) {
            await ask({
              sessionID: input.sessionID,
              agent: input.agent,
              permission: req.permission,
              callID,
              messageID,
            })
          },
        })
        await Plugin.trigger(
          "tool.execute.after",
          { tool: item.id, sessionID: input.sessionID, callID },
          result,
        )
        return result
      },
    }
  }

  if (allowed.size === 0 || allowed.has("ls")) {
    const info = await ListTool.init({ agent })
    out.ls = {
      name: "ls",
      description: info.description,
      inputSchema: z.toJSONSchema(info.parameters) as Record<string, unknown>,
      async execute(args, abort) {
        const callID = Identifier.ascending("tool")
        const messageID = Identifier.ascending("message")
        const result = await info.execute(args, {
          sessionID: input.sessionID,
          messageID,
          agent: input.agent,
          abort,
          callID,
          messages: [],
          metadata() {},
          async ask() {},
        })
        return result
      },
    }
  }

  for (const [key, item] of Object.entries(await MCP.tools())) {
    if (allowed.size > 0 && !allowed.has(key)) continue
    const execute = item.execute
    if (!execute) continue
    const schema = (item.inputSchema as { jsonSchema?: Record<string, unknown> })?.jsonSchema ?? {
      type: "object",
      properties: {},
      additionalProperties: false,
    }
    out[key] = {
      name: key,
      description: item.description ?? key,
      inputSchema: schema,
      async execute(args, abort) {
        const callID = Identifier.ascending("tool")
        const messageID = Identifier.ascending("message")
        await Plugin.trigger(
          "tool.execute.before",
          { tool: key, sessionID: input.sessionID, callID },
          { args },
        )
        await ask({
          sessionID: input.sessionID,
          agent: input.agent,
          permission: key,
          callID,
          messageID,
        })
        const result = await execute(args, {
          toolCallId: callID,
          abortSignal: abort,
          messages: [],
        })
        await Plugin.trigger(
          "tool.execute.after",
          { tool: key, sessionID: input.sessionID, callID },
          result,
        )
        const truncated = await Truncate.output(renderMcpContent(result.content as Array<Record<string, unknown>>), {}, agent)
        return {
          title: "",
          output: truncated.content,
          metadata: {
            ...(result.metadata ?? {}),
            truncated: truncated.truncated,
            ...(truncated.truncated && { outputPath: truncated.outputPath }),
          },
        }
      },
    }
  }

  return out
}

export function instructions(tools: CursorTool[]) {
  if (tools.length === 0) return ""
  return [
    "CRITICAL — OpenCode tool calling protocol:",
    `These tools are ONLY callable via XML blocks. DO NOT run them as shell commands. DO NOT use bash or execute.`,
    `Before calling a tool, briefly describe what you are about to do in one short sentence.`,
    `Then emit the XML block: <${TAG} name="tool_name">{"arg":"value"}</${TAG}>`,
    "Arguments must be valid JSON. Use {} when no arguments are needed.",
    `After execution you receive <${RESULT}> or <${ERROR}> blocks — continue from there.`,
    "Never claim these tools are unavailable unless an error block tells you so.",
    "",
    "Available tools:",
    ...tools.map((item) => `- ${item.name}: ${item.description}\n  Schema: ${stringifySchema(item.inputSchema)}`),
  ].join("\n")
}

export function parse(text: string): ParsedToolCalls {
  const calls = [] as ParsedToolCall[]
  const errors = [] as ParsedToolError[]
  const rx = new RegExp(`<${TAG}\\s+name="([^"]+)">([\\s\\S]*?)<\\/${TAG}>`, "g")
  let match: RegExpExecArray | null
  while ((match = rx.exec(text))) {
    const name = match[1]
    const body = stripFence(match[2])
    try {
      const parsed = JSON.parse(body || "{}")
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        errors.push({ name, error: "Tool arguments must be a JSON object." })
        continue
      }
      calls.push({
        name,
        args: parsed as Record<string, unknown>,
      })
    } catch (error) {
      errors.push({
        name,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return {
    text: text.replace(rx, "").trim(),
    calls,
    errors,
  }
}

export function toolPrompt(results: Array<{ name: string; output: string; error?: boolean }>) {
  return [
    ...results.map((item) =>
      stringifyResult(item.error ? ERROR : RESULT, item.name, item.output || (item.error ? "Tool failed." : "Tool completed.")),
    ),
    `Continue from the latest user request. If you need another tool, emit <${TAG}> blocks only.`,
  ].join("\n\n")
}

export const CursorToolCall = {
  TAG,
  RESULT,
  ERROR,
  STEP_MAX,
}
