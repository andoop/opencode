import { Agent } from "@/agent/agent"
import { Identifier } from "@/id/id"
import { MCP } from "@/mcp"
import { PermissionNext } from "@/permission/next"
import { Plugin } from "@/plugin"
import { Session } from "@/session"
import { Tool } from "./tool"
import z from "zod"

function stringify(input: unknown) {
  return JSON.stringify(input, undefined, 2)
}

function renderContent(content: Array<Record<string, unknown>>) {
  return content
    .flatMap((item) => {
      if (item.type === "text") return [String(item.text ?? "")]
      if (item.type === "resource" && item.resource && typeof item.resource === "object") {
        const resource = item.resource as { text?: string; uri?: string }
        if (typeof resource.text === "string") return [resource.text]
        if (typeof resource.uri === "string") return [resource.uri]
      }
      if (item.type === "image") return ["[image omitted]"]
      return []
    })
    .join("\n\n")
    .trim()
}

async function ask(ctx: Tool.Context, permission: string) {
  const agent = await Agent.get(ctx.agent)
  const session = await Session.get(ctx.sessionID).catch(() => undefined)
  await PermissionNext.ask({
    sessionID: ctx.sessionID,
    permission,
    metadata: {},
    patterns: ["*"],
    always: ["*"],
    tool: {
      messageID: ctx.messageID,
      callID: ctx.callID ?? Identifier.ascending("tool"),
    },
    ruleset: PermissionNext.merge(agent.permission, session?.permission ?? []),
  })
}

export const McpStatusTool = Tool.define("mcp_status", {
  description:
    "Inspect configured MCP servers and cached tool discovery state. Start here when you need to know whether MCP servers are connected, refreshing, failed, or waiting for auth.",
  parameters: z.object({}),
  async execute() {
    const catalog = await MCP.catalog()
    return {
      title: "MCP status",
      output: stringify(
        Object.fromEntries(
          Object.entries(catalog).map(([server, item]) => [
            server,
            {
              status: item.status,
              toolCount: item.tools.length,
              loadedAt: item.loadedAt,
              refreshing: item.refreshing,
              stale: item.stale,
              error: item.error,
            },
          ]),
        ),
      ),
      metadata: {},
    }
  },
})

export const McpSearchToolsTool = Tool.define("mcp_search_tools", {
  description:
    "Search cached MCP tools by natural language, server name, tool name, or description. Returns concise MCP tool ids only; inspect a selected id with the MCP tool-details meta tool before calling it.",
  parameters: z.object({
    query: z.string().optional().describe("Search query. Leave empty to list the first available MCP tools."),
    limit: z.number().optional().describe("Maximum number of tools to return. Defaults to 20."),
  }),
  async execute(args) {
    return {
      title: "MCP tools",
      output: stringify(await MCP.searchTools(args)),
      metadata: {},
    }
  },
})

export const McpToolDetailsTool = Tool.define("mcp_tool_details", {
  description: "Get the full input schema and metadata for one discovered MCP tool id before calling it.",
  parameters: z.object({
    tool: z.string().describe("The MCP tool id returned by mcp_search_tools, for example github_create_issue."),
  }),
  async execute(args) {
    const details = await MCP.toolDetails(args.tool)
    if (!details) throw new Error(`Unknown MCP tool: ${args.tool}`)
    return {
      title: args.tool,
      output: stringify(details),
      metadata: {},
    }
  },
})

export const McpCallToolTool = Tool.define("mcp_call_tool", {
  description:
    "Call a specific MCP tool id after inspecting its schema with the MCP tool-details meta tool. The underlying MCP tool id is permission-checked directly.",
  parameters: z.object({
    tool: z.string().describe("The MCP tool id returned by mcp_search_tools."),
    args: z.record(z.string(), z.unknown()).optional().describe("Arguments for the MCP tool."),
  }),
  async execute(args, ctx) {
    const callID = ctx.callID ?? Identifier.ascending("tool")
    await ask({ ...ctx, callID }, args.tool)
    await Plugin.trigger(
      "tool.execute.before",
      { tool: args.tool, sessionID: ctx.sessionID, callID },
      { args: args.args ?? {} },
    )
    const result = await MCP.executeTool(args.tool, args.args ?? {}, ctx.abort)
    await Plugin.trigger("tool.execute.after", { tool: args.tool, sessionID: ctx.sessionID, callID }, result)
    return {
      title: args.tool,
      output: renderContent(result.content as Array<Record<string, unknown>>) || "Tool completed with no output.",
      metadata: result.metadata ?? {},
    }
  },
})
