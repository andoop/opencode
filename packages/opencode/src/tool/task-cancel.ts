import { Tool } from "./tool"
import z from "zod"
import { Storage } from "@/storage/storage"
import { Instance } from "@/project/instance"
import { TaskRunner } from "@/task/runner"

const parameters = z.object({
  task_id: z.string().describe("Task ID to cancel"),
})

export const TaskCancelTool = Tool.define<typeof parameters, Record<string, unknown>>("task_cancel", {
  description: "Cancel a running background task",
  parameters,
  async execute(args) {
    const projectID = Instance.project.id
    const task = await Storage.read<{ status: string }>(["task", projectID, args.task_id])
    if (!task) {
      return {
        title: "Task Cancel",
        metadata: {},
        output: "Task not found",
      }
    }
    if (task.status !== "running") {
      return {
        title: "Task Cancel",
        metadata: {},
        output: `Task cannot be cancelled (status: ${task.status}). Only running tasks can be cancelled.`,
      }
    }
    TaskRunner.abort(args.task_id)
    return {
      title: "Task Cancel",
      metadata: {},
      output: "Cancel requested",
    }
  },
})
