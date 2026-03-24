import { expect, test } from "bun:test"
import { CursorToolCall, parse, toolPrompt } from "../../src/cursor/toolcall"

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
