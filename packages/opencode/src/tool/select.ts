import z from "zod"
import { Tool } from "./tool"
import { Select } from "../select"
import DESCRIPTION from "./select.txt"

export const SelectTool = Tool.define("select", {
  description: DESCRIPTION,
  parameters: z.object({
    title: z.string().optional().describe("Optional title shown above the selector"),
    placeholder: z.string().optional().describe("Optional search placeholder"),
    options: z
      .array(Select.Option)
      .describe("Options the user can choose from. Provide the full relevant list; do not truncate just because the list is long"),
    custom: z.boolean().optional().describe("Allow typing a custom value"),
  }),
  async execute(params, ctx) {
    const result = await Select.ask({
      sessionID: ctx.sessionID,
      title: params.title,
      placeholder: params.placeholder,
      options: params.options,
      custom: params.custom,
      tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
    })

    return {
      title: "User made a selection",
      output: `User selected "${result.value}" (${result.source ?? "option"}). You can now continue with that choice in mind.`,
      metadata: result,
    }
  },
})
