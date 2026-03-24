import { createInterface } from "readline"
import { fileURLToPath } from "url"
import os from "os"
import path from "path"
import { Identifier } from "@/id/id"
import { Agent } from "@/agent/agent"
import { ToolRegistry } from "@/tool/registry"
import { Tool } from "@/tool/tool"
import { ListTool } from "@/tool/ls"
import { Installation } from "@/installation"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import { Log } from "@/util/log"

const PREFIX = "opencode_"
const blog = Log.create({ service: "cursor-bridge" })

function truncateBridge(text: string, max: number) {
  if (text.length <= max) return text
  return text.slice(0, max) + "…"
}
const BRIDGED = new Set([
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

type BridgeContext = {
  cwd: string
  sessionID: string
  agent: string
  allowed: Set<string>
}

type BridgeTool = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute(args: Record<string, unknown>, abort: AbortSignal): Promise<{
    content: Array<Record<string, unknown>>
    isError?: boolean
  }>
}

export function prefixTool(name: string) {
  return PREFIX + name.replace(/[^a-zA-Z0-9_-]/g, "_")
}

function parseDataUrl(url: string) {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/.exec(url)
  if (!match) return
  return {
    mime: match[1],
    data: match[3],
  }
}

function resultContent(output: string, attachments?: Array<{ mime: string; url: string; filename?: string }>) {
  const content = [] as Array<Record<string, unknown>>
  if (output) {
    content.push({
      type: "text",
      text: output,
    })
  }
  for (const attachment of attachments ?? []) {
    const parsed = parseDataUrl(attachment.url)
    if (!parsed) continue
    if (parsed.mime.startsWith("image/")) {
      content.push({
        type: "image",
        mimeType: parsed.mime,
        data: parsed.data,
      })
      continue
    }
    content.push({
      type: "resource",
      resource: {
        uri: attachment.filename ?? attachment.url,
        mimeType: parsed.mime,
        blob: parsed.data,
      },
    })
  }
  if (content.length > 0) return content
  return [
    {
      type: "text",
      text: "Tool completed with no output.",
    },
  ]
}

async function nativeTools(ctx: BridgeContext) {
  const agent = await Agent.get(ctx.agent)
  const tools = await ToolRegistry.tools(
    {
      providerID: "cursor-cli",
      modelID: "auto",
    },
    agent,
  )
  const result = [] as Array<{
    id: string
    description: string
    parameters: z.ZodType
    execute: (args: any, ctx: Tool.Context) => Promise<{
      title: string
      metadata: Record<string, unknown>
      output: string
      attachments?: Array<{ mime: string; url: string; filename?: string }>
    }>
  }>
  for (const item of tools) {
    if (!ctx.allowed.has(item.id) || !BRIDGED.has(item.id)) continue
    result.push(item)
  }
  if (ctx.allowed.has("ls") || ctx.allowed.size === 0) {
    const info = await ListTool.init({ agent })
    result.push({
      id: "ls",
      description: info.description,
      parameters: info.parameters,
      execute: info.execute,
    })
  }
  return result
}

async function buildTools(ctx: BridgeContext): Promise<BridgeTool[]> {
  const base = await nativeTools(ctx)
  return base.map(
    (item): BridgeTool => ({
      name: prefixTool(item.id),
      description: item.description,
      inputSchema: z.toJSONSchema(item.parameters) as Record<string, unknown>,
      async execute(args, signal) {
        const result = await item.execute(args, {
          sessionID: ctx.sessionID,
          messageID: Identifier.ascending("message"),
          agent: ctx.agent,
          abort: signal,
          messages: [],
          metadata() {},
          async ask() {},
        })
        return {
          content: resultContent(result.output, result.attachments),
        }
      },
    }),
  )
}

export async function bridgeToolNames(input: { agent: string; allowedTools: string[] }) {
  const allowed = new Set(input.allowedTools)
  const tools = await buildTools({
    cwd: process.cwd(),
    sessionID: Identifier.ascending("session"),
    agent: input.agent,
    allowed,
  })
  return tools.map((item) => item.name)
}

export function bridgeCommand(input: { cwd: string; sessionID: string; agent: string; allowedTools: string[] }) {
  const env = {
    OPENCODE_CURSOR_ALLOWED_TOOLS: JSON.stringify(input.allowedTools),
    OPENCODE_CURSOR_SESSION_ID: input.sessionID,
    OPENCODE_CURSOR_AGENT: input.agent,
    XDG_STATE_HOME: process.env.XDG_STATE_HOME || path.join(os.tmpdir(), "opencode-cursor-xdg"),
  }
  const script = fileURLToPath(new URL("../index.ts", import.meta.url))
  if (process.env.OPENCODE_CURSOR_BRIDGE_COMMAND) {
    const [command, ...args] = process.env.OPENCODE_CURSOR_BRIDGE_COMMAND.split(" ")
    return { command, args: [...args, "--cwd", input.cwd], env }
  }
  if (process.execPath.toLowerCase().includes("bun")) {
    return {
      command: process.execPath,
      args: ["run", "--conditions=browser", script, "cursor-bridge", "--cwd", input.cwd],
      env,
    }
  }
  return {
    command: process.execPath,
    args: ["cursor-bridge", "--cwd", input.cwd],
    env,
  }
}

export async function startBridgeServer(input: { cwd: string; sessionID: string; agent: string; allowedTools: string[] }) {
  const tools = await buildTools({
    cwd: input.cwd,
    sessionID: input.sessionID,
    agent: input.agent,
    allowed: new Set(input.allowedTools),
  })
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]))
  const server = new Server(
    {
      name: "opencode-cursor-bridge",
      version: Installation.VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    }
  })

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = byName[req.params.name]
    if (!tool) {
      blog.warn("bridged tool not found", { name: req.params.name })
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }],
      }
    }
    const abort = new AbortController()
    try {
      const args = (req.params.arguments ?? {}) as Record<string, unknown>
      blog.info("bridged tool execute start", {
        sessionID: input.sessionID,
        agent: input.agent,
        name: req.params.name,
        argKeys: Object.keys(args).slice(0, 10).join(","),
      })
      const result = await tool.execute(args, abort.signal)
      blog.info("bridged tool execute complete", {
        sessionID: input.sessionID,
        agent: input.agent,
        name: req.params.name,
        isError: result.isError === true,
        contentTypes: result.content.map((item) => String(item["type"] ?? "")).join(","),
        textPreview: truncateBridge(
          result.content
            .filter((item) => item["type"] === "text")
            .map((item) => String(item["text"] ?? ""))
            .join("\n"),
          240,
        ),
      })
      return result
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      blog.warn("bridged tool execute threw", {
        sessionID: input.sessionID,
        agent: input.agent,
        name: req.params.name,
        error: truncateBridge(msg, 500),
      })
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: error instanceof Error ? error.message : String(error),
          },
        ],
      }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)

  const rl = createInterface({ input: process.stdin })
  await new Promise<void>((resolve) => {
    rl.on("close", () => resolve())
  })
}
