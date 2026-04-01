import { bootstrap } from "../bootstrap"
import { cmd } from "./cmd"
import { startBridgeServer } from "@/kiro/bridge"

export const KiroBridgeCommand = cmd({
  command: "kiro-bridge",
  describe: "start the Kiro MCP bridge",
  builder: (yargs) =>
    yargs.option("cwd", {
      type: "string",
      describe: "working directory",
      default: process.cwd(),
    }),
  async handler(args) {
    const allowedTools = JSON.parse(process.env.OPENCODE_KIRO_ALLOWED_TOOLS || "[]") as string[]
    const sessionID = process.env.OPENCODE_KIRO_SESSION_ID || "kiro-bridge"
    const agent = process.env.OPENCODE_KIRO_AGENT || "build"
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
