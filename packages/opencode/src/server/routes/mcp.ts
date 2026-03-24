import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { MCP } from "../../mcp"
import { Config } from "../../config/config"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { User } from "@/user"

const McpConfigQuery = z.object({
  scope: Config.McpScope.optional(),
})

const McpConfigRemoteInput = z
  .object({
    url: z.string().describe("URL of the remote MCP server"),
    enabled: z.boolean().optional().describe("Enable or disable the MCP server on startup"),
    oauth: z.literal(false).optional().describe("Explicitly disable OAuth for this remote MCP server"),
  })
  .strict()

const McpConfigRemote = z
  .object({
    type: z.literal("remote"),
    url: z.string(),
    enabled: z.boolean().optional(),
    oauth: z.literal(false).optional(),
  })
  .strict()

const McpConfigList = z.object({
  path: z.string(),
  mcp: z.record(z.string(), McpConfigRemote),
})

const McpToolRule = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  action: Config.PermissionAction,
})

const McpToolList = z.object({
  path: z.string(),
  tools: z.record(z.string(), McpToolRule.array()),
})

type McpEntry = NonNullable<Config.Info["mcp"]>[string]
type PermissionMap = Record<string, unknown>

function isMcpConfigured(entry: McpEntry | undefined): entry is Config.Mcp {
  return typeof entry === "object" && entry !== null && "type" in entry
}

function isMcpRemote(entry: McpEntry | undefined): entry is z.infer<typeof Config.McpRemote> {
  return isMcpConfigured(entry) && entry.type === "remote"
}

function scopeAccess(scope: Config.McpScope) {
  if (scope !== "global") return
  const user = User.current()
  if (user?.role === "admin") return
  return { error: "Admin access required" }
}

function getPermissionAction(value: unknown): Config.PermissionAction | undefined {
  if (value === "allow" || value === "ask" || value === "deny") return value
  return
}

function toPermissionMap(value: unknown): PermissionMap {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as PermissionMap
  const action = getPermissionAction(value)
  if (action) return { "*": action }
  return {}
}

function actionFor(permission: unknown, id: string): Config.PermissionAction {
  const map = toPermissionMap(permission)
  const direct = map[id]
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    const wildcard = getPermissionAction((direct as PermissionMap)["*"])
    if (wildcard) return wildcard
  }
  const action = getPermissionAction(direct)
  if (action) return action
  const wildcard = map["*"]
  if (wildcard && typeof wildcard === "object" && !Array.isArray(wildcard)) {
    const nested = getPermissionAction((wildcard as PermissionMap)["*"])
    if (nested) return nested
  }
  const fallback = getPermissionAction(wildcard)
  if (fallback) return fallback
  return "allow"
}

function remoteConfig(scope: Awaited<ReturnType<typeof Config.getMcp>>) {
  return {
    path: scope.path,
    mcp: Object.fromEntries(
      Object.entries(scope.mcp).filter(
        (entry): entry is [string, z.infer<typeof Config.McpRemote>] => isMcpRemote(entry[1]),
      )
        .map(([name, entry]) => [
          name,
          {
            type: "remote" as const,
            url: entry.url,
            ...(entry.enabled !== undefined ? { enabled: entry.enabled } : {}),
            ...(entry.oauth === false ? { oauth: false as const } : {}),
          },
        ]),
    ),
  }
}

async function toolConfig(scope: Config.McpScope) {
  const [mcp, permission, tools] = await Promise.all([
    Config.getMcp(scope),
    Config.getPermission(scope),
    MCP.listTools(),
  ])

  return {
    path: mcp.path,
    tools: Object.fromEntries(
      Object.entries(mcp.mcp)
        .filter((entry): entry is [string, z.infer<typeof Config.McpRemote>] => isMcpRemote(entry[1]))
        .map(([name]) => [
          name,
          (tools[name] ?? []).map((tool) => ({
            id: tool.id,
            name: tool.name,
            description: tool.description,
            action: actionFor(permission.permission, tool.id),
          })),
        ]),
    ),
  }
}

export const McpRoutes = lazy(() =>
  new Hono()
    .use(async (_, next) => {
      User.requireFeature("mcp")
      return next()
    })
    .get(
      "/",
      describeRoute({
        summary: "Get MCP status",
        description: "Get the status of all Model Context Protocol (MCP) servers.",
        operationId: "mcp.status",
        responses: {
          200: {
            description: "MCP server status",
            content: {
              "application/json": {
                schema: resolver(z.record(z.string(), MCP.Status)),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await MCP.status())
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Add MCP server",
        description: "Dynamically add a new Model Context Protocol (MCP) server to the system.",
        operationId: "mcp.add",
        responses: {
          200: {
            description: "MCP server added successfully",
            content: {
              "application/json": {
                schema: resolver(z.record(z.string(), MCP.Status)),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          name: z.string(),
          config: Config.Mcp,
        }),
      ),
      async (c) => {
        const { name, config } = c.req.valid("json")
        const result = await MCP.add(name, config)
        return c.json(result.status)
      },
    )
    .get(
      "/config",
      describeRoute({
        summary: "List MCP config",
        description: "List persisted MCP server configuration for the selected scope.",
        operationId: "mcp.config.list",
        responses: {
          200: {
            description: "Persisted MCP configuration",
            content: {
              "application/json": {
                schema: resolver(McpConfigList),
              },
            },
          },
        },
      }),
      validator("query", McpConfigQuery),
      async (c) => {
        const scope = c.req.valid("query").scope ?? "project"
        const denied = scopeAccess(scope)
        if (denied) return c.json(denied, 403)
        return c.json(remoteConfig(await Config.getMcp(scope)))
      },
    )
    .post(
      "/config",
      describeRoute({
        summary: "Create MCP config",
        description: "Create a persisted remote MCP server configuration for the selected scope.",
        operationId: "mcp.config.create",
        responses: {
          200: {
            description: "Persisted MCP configuration",
            content: {
              "application/json": {
                schema: resolver(McpConfigList),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("query", McpConfigQuery),
      validator(
        "json",
        z.object({
          name: z.string().min(1),
          config: McpConfigRemoteInput,
        }),
      ),
      async (c) => {
        const scope = c.req.valid("query").scope ?? "project"
        const denied = scopeAccess(scope)
        if (denied) return c.json(denied, 403)
        const body = c.req.valid("json")
        const current = await Config.getMcp(scope)
        if (current.mcp[body.name]) {
          return c.json({ error: `MCP server ${body.name} already exists` }, 400)
        }
        const result = await Config.upsertMcp(scope, body.name, {
          type: "remote",
          ...body.config,
        })
        return c.json(remoteConfig(result))
      },
    )
    .patch(
      "/config/:name",
      describeRoute({
        summary: "Update MCP config",
        description: "Update a persisted remote MCP server configuration for the selected scope.",
        operationId: "mcp.config.update",
        responses: {
          200: {
            description: "Persisted MCP configuration",
            content: {
              "application/json": {
                schema: resolver(McpConfigList),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("query", McpConfigQuery),
      validator("param", z.object({ name: z.string() })),
      validator(
        "json",
        z.object({
          config: McpConfigRemoteInput.partial(),
        }),
      ),
      async (c) => {
        const scope = c.req.valid("query").scope ?? "project"
        const denied = scopeAccess(scope)
        if (denied) return c.json(denied, 403)
        const name = c.req.valid("param").name
        const current = await Config.getMcp(scope)
        const entry = current.mcp[name]
        if (!entry || !isMcpRemote(entry)) {
          return c.json({ error: `MCP server ${name} not found` }, 404)
        }
        const result = await Config.upsertMcp(scope, name, {
          ...entry,
          ...c.req.valid("json").config,
        })
        return c.json(remoteConfig(result))
      },
    )
    .delete(
      "/config/:name",
      describeRoute({
        summary: "Delete MCP config",
        description: "Delete a persisted MCP server configuration for the selected scope.",
        operationId: "mcp.config.delete",
        responses: {
          200: {
            description: "Persisted MCP configuration",
            content: {
              "application/json": {
                schema: resolver(McpConfigList),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("query", McpConfigQuery),
      validator("param", z.object({ name: z.string() })),
      async (c) => {
        const scope = c.req.valid("query").scope ?? "project"
        const denied = scopeAccess(scope)
        if (denied) return c.json(denied, 403)
        const name = c.req.valid("param").name
        const current = await Config.getMcp(scope)
        if (!isMcpRemote(current.mcp[name])) {
          return c.json({ error: `MCP server ${name} not found` }, 404)
        }
        const result = await Config.removeMcp(scope, name)
        return c.json(remoteConfig(result))
      },
    )
    .get(
      "/config/tools",
      describeRoute({
        summary: "List MCP tools",
        description: "List connected MCP tools and their scoped permission actions.",
        operationId: "mcp.config.tools.list",
        responses: {
          200: {
            description: "Scoped MCP tool permissions",
            content: {
              "application/json": {
                schema: resolver(McpToolList),
              },
            },
          },
        },
      }),
      validator("query", McpConfigQuery),
      async (c) => {
        const scope = c.req.valid("query").scope ?? "project"
        const denied = scopeAccess(scope)
        if (denied) return c.json(denied, 403)
        return c.json(await toolConfig(scope))
      },
    )
    .patch(
      "/config/tools/:id",
      describeRoute({
        summary: "Update MCP tool permission",
        description: "Update the scoped permission action for an individual MCP tool.",
        operationId: "mcp.config.tools.update",
        responses: {
          200: {
            description: "Scoped MCP tool permissions",
            content: {
              "application/json": {
                schema: resolver(McpToolList),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("query", McpConfigQuery),
      validator("param", z.object({ id: z.string() })),
      validator(
        "json",
        z.object({
          action: Config.PermissionAction,
        }),
      ),
      async (c) => {
        const scope = c.req.valid("query").scope ?? "project"
        const denied = scopeAccess(scope)
        if (denied) return c.json(denied, 403)
        const id = c.req.valid("param").id
        const tools = await toolConfig(scope)
        const exists = Object.values(tools.tools).some((items) => items.some((item) => item.id === id))
        if (!exists) {
          return c.json({ error: `MCP tool ${id} not found` }, 400)
        }
        await Config.upsertPermission(scope, id, c.req.valid("json").action)
        return c.json(await toolConfig(scope))
      },
    )
    .post(
      "/:name/auth",
      describeRoute({
        summary: "Start MCP OAuth",
        description: "Start OAuth authentication flow for a Model Context Protocol (MCP) server.",
        operationId: "mcp.auth.start",
        responses: {
          200: {
            description: "OAuth flow started",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    authorizationUrl: z.string().describe("URL to open in browser for authorization"),
                  }),
                ),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      async (c) => {
        const name = c.req.param("name")
        const supportsOAuth = await MCP.supportsOAuth(name)
        if (!supportsOAuth) {
          return c.json({ error: `MCP server ${name} does not support OAuth` }, 400)
        }
        const result = await MCP.startAuth(name)
        return c.json(result)
      },
    )
    .post(
      "/:name/auth/callback",
      describeRoute({
        summary: "Complete MCP OAuth",
        description:
          "Complete OAuth authentication for a Model Context Protocol (MCP) server using the authorization code.",
        operationId: "mcp.auth.callback",
        responses: {
          200: {
            description: "OAuth authentication completed",
            content: {
              "application/json": {
                schema: resolver(MCP.Status),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "json",
        z.object({
          code: z.string().describe("Authorization code from OAuth callback"),
        }),
      ),
      async (c) => {
        const name = c.req.param("name")
        const { code } = c.req.valid("json")
        const status = await MCP.finishAuth(name, code)
        return c.json(status)
      },
    )
    .post(
      "/:name/auth/authenticate",
      describeRoute({
        summary: "Authenticate MCP OAuth",
        description: "Start OAuth flow and wait for callback (opens browser)",
        operationId: "mcp.auth.authenticate",
        responses: {
          200: {
            description: "OAuth authentication completed",
            content: {
              "application/json": {
                schema: resolver(MCP.Status),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      async (c) => {
        const name = c.req.param("name")
        const supportsOAuth = await MCP.supportsOAuth(name)
        if (!supportsOAuth) {
          return c.json({ error: `MCP server ${name} does not support OAuth` }, 400)
        }
        const status = await MCP.authenticate(name)
        return c.json(status)
      },
    )
    .delete(
      "/:name/auth",
      describeRoute({
        summary: "Remove MCP OAuth",
        description: "Remove OAuth credentials for an MCP server",
        operationId: "mcp.auth.remove",
        responses: {
          200: {
            description: "OAuth credentials removed",
            content: {
              "application/json": {
                schema: resolver(z.object({ success: z.literal(true) })),
              },
            },
          },
          ...errors(404),
        },
      }),
      async (c) => {
        const name = c.req.param("name")
        await MCP.removeAuth(name)
        return c.json({ success: true as const })
      },
    )
    .post(
      "/:name/connect",
      describeRoute({
        description: "Connect an MCP server",
        operationId: "mcp.connect",
        responses: {
          200: {
            description: "MCP server connected successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      validator("param", z.object({ name: z.string() })),
      async (c) => {
        const { name } = c.req.valid("param")
        await MCP.connect(name)
        return c.json(true)
      },
    )
    .post(
      "/:name/disconnect",
      describeRoute({
        description: "Disconnect an MCP server",
        operationId: "mcp.disconnect",
        responses: {
          200: {
            description: "MCP server disconnected successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
        },
      }),
      validator("param", z.object({ name: z.string() })),
      async (c) => {
        const { name } = c.req.valid("param")
        await MCP.disconnect(name)
        return c.json(true)
      },
    ),
)
