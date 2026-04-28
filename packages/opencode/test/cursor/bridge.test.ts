import { afterEach, expect, test } from "bun:test"
import { bridgeCommand, prefixTool } from "../../src/cursor/bridge"

afterEach(() => {
  delete process.env.OPENCODE_CURSOR_BRIDGE_COMMAND
})

test("prefixes bridged tool names", () => {
  expect(prefixTool("read")).toBe("opencode_read")
  expect(prefixTool("foo:bar")).toBe("opencode_foo_bar")
  expect(prefixTool("mcp_search_tools")).toBe("opencode_mcp_search_tools")
})

test("builds bridge command with session context", () => {
  const result = bridgeCommand({
    cwd: "/tmp/project",
    sessionID: "session_123",
    agent: "build",
    allowedTools: ["read", "bash"],
  })

  expect(result.args).toContain("cursor-bridge")
  expect(result.args).toContain("--cwd")
  expect(result.args).toContain("/tmp/project")
  expect(result.env.OPENCODE_CURSOR_SESSION_ID).toBe("session_123")
  expect(result.env.OPENCODE_CURSOR_AGENT).toBe("build")
  expect(result.env.OPENCODE_CURSOR_ALLOWED_TOOLS).toContain("read")
})
