import z from "zod"
import { Tool } from "./tool"
import { ProjectProfile } from "@/project/profile"

export const ProfileTool = Tool.define("profile", {
  description:
    "Load supplemental workspace, project, or group profile details when the built-in project context is not enough or you need a specific profile on demand.",
  parameters: z.object({
    scope: z.enum(["workspace", "project", "group"]).default("workspace"),
    projectID: z.string().optional(),
    groupID: z.string().optional(),
  }),
  async execute(params) {
    const output =
      params.scope === "group"
        ? await ProjectProfile.group(params.groupID)
        : params.scope === "project"
          ? await ProjectProfile.project(params.projectID)
          : await ProjectProfile.workspace()

    return {
      title: `Loaded ${params.scope} profile`,
      output,
      metadata: {
        scope: params.scope,
      },
    }
  },
})
