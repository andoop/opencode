import { beforeEach, expect, mock, test } from "bun:test"

let listCalls = 0
let callToolName = ""

mock.module("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class MockStreamableHTTP {
    constructor(_url: URL, _options?: unknown) {}
  },
}))

mock.module("@modelcontextprotocol/sdk/client/sse.js", () => ({
  SSEClientTransport: class MockSSE {
    constructor(_url: URL, _options?: unknown) {}
  },
}))

mock.module("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class MockClient {
    async connect() {}
    setNotificationHandler() {}
    async listTools() {
      listCalls++
      return {
        tools: [
          {
            name: "lookup",
            description: "Lookup a record",
            inputSchema: {
              type: "object",
              properties: {
                q: { type: "string" },
              },
            },
          },
        ],
      }
    }
    async callTool(input: { name: string }) {
      callToolName = input.name
      return {
        content: [{ type: "text", text: "ok" }],
        metadata: {},
      }
    }
    async close() {}
  },
}))

const { MCP } = await import("../../src/mcp")
const { Instance } = await import("../../src/project/instance")
const { tmpdir } = await import("../fixture/fixture")

beforeEach(() => {
  listCalls = 0
  callToolName = ""
})

test("MCP tools are cached after first discovery", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      await MCP.add("test-server", {
        type: "remote",
        url: "https://example.com/mcp",
        oauth: false,
      })

      expect(Object.keys(await MCP.tools())).toEqual(["test-server_lookup"])
      expect(Object.keys(await MCP.tools())).toEqual(["test-server_lookup"])
      expect(listCalls).toBe(1)
    },
  })
})

test("MCP catalog supports search, details, and execution", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      await MCP.add("test-server", {
        type: "remote",
        url: "https://example.com/mcp",
        oauth: false,
      })

      expect(await MCP.searchTools({ query: "record" })).toEqual([
        {
          id: "test-server_lookup",
          name: "lookup",
          client: "test-server",
          description: "Lookup a record",
        },
      ])
      expect(await MCP.toolDetails("test-server_lookup")).toMatchObject({
        id: "test-server_lookup",
        inputSchema: {
          type: "object",
        },
      })
      expect(await MCP.executeTool("test-server_lookup", { q: "x" })).toMatchObject({
        content: [{ type: "text", text: "ok" }],
      })
      expect(callToolName).toBe("lookup")
    },
  })
})

