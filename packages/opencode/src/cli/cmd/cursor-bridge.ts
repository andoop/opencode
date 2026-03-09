import { bootstrap } from "../bootstrap"
import { cmd } from "./cmd"
import { startBridgeServer } from "@/cursor/bridge"

export const CursorBridgeCommand = cmd({
  command: "cursor-bridge",
  describe: "start the Cursor MCP bridge",
  builder: (yargs) =>
    yargs.option("cwd", {
      type: "string",
      describe: "working directory",
      default: process.cwd(),
    }),
  async handler(args) {
    const allowedTools = JSON.parse(process.env.OPENCODE_CURSOR_ALLOWED_TOOLS || "[]") as string[]
    const sessionID = process.env.OPENCODE_CURSOR_SESSION_ID || "cursor-bridge"
    const agent = process.env.OPENCODE_CURSOR_AGENT || "build"
    await bootstrap(args.cwd, async () => {
      await startBridgeServer({
        cwd: args.cwd,
        sessionID,
        agent,
        allowedTools,
      })
    })
  },
})
