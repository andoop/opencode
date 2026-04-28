import { expect, test } from "bun:test"
import { CursorToolCall, instructions, parse, toolPrompt } from "../../src/cursor/toolcall"

test("parses multiple tool calls", () => {
  const result = parse(`
before
<${CursorToolCall.TAG} name="android_status">
{}
</${CursorToolCall.TAG}>
<${CursorToolCall.TAG} name="android_build">
{"target":"debug"}
</${CursorToolCall.TAG}>
after
`)

  expect(result.calls).toEqual([
    { name: "android_status", args: {} },
    { name: "android_build", args: { target: "debug" } },
  ])
  expect(result.errors).toEqual([])
  expect(result.text).toContain("before")
  expect(result.text).toContain("after")
})

test("parses fenced json tool call payload", () => {
  const result = parse(`
<${CursorToolCall.TAG} name="read">
\`\`\`json
{"filePath":"README.md"}
\`\`\`
</${CursorToolCall.TAG}>
`)

  expect(result.calls).toEqual([{ name: "read", args: { filePath: "README.md" } }])
  expect(result.errors).toEqual([])
})

test("returns parse errors for invalid json", () => {
  const result = parse(`
<${CursorToolCall.TAG} name="read">
{invalid}
</${CursorToolCall.TAG}>
`)

  expect(result.calls).toEqual([])
  expect(result.errors).toHaveLength(1)
  expect(result.errors[0]?.name).toBe("read")
})

test("formats tool result continuation prompt", () => {
  const result = toolPrompt([
    { name: "read", output: "hello" },
    { name: "bash", output: "denied", error: true },
  ])

  expect(result).toContain(CursorToolCall.RESULT)
  expect(result).toContain(CursorToolCall.ERROR)
  expect(result).toContain("Continue from the latest user request")
})

test("formats MCP discovery meta tool instructions", () => {
  const result = instructions([
    {
      name: "opencode_mcp_search_tools",
      description: "Search MCP tools",
      inputSchema: { type: "object", properties: { query: { type: "string" } } },
      execute: async () => ({ title: "", output: "", metadata: {} }),
    },
  ])

  expect(result).toContain("opencode_mcp_search_tools")
  expect(result).toContain("Search MCP tools")
  expect(result).toContain("Use the exact tool names listed below, including the opencode_ prefix.")
  expect(result).toContain("Emitting the XML block IS the tool call.")
  expect(result).toContain("Cursor did not register the tool")
  expect(result).toContain("Do NOT emit discovered MCP tool ids as XML tool names.")
})
