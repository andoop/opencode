import { Tool } from "./tool"
import z from "zod"
import { Storage } from "@/storage/storage"
import type { Task } from "@/task/types"
import { Instance } from "@/project/instance"
import { TaskRunner } from "@/task/runner"

const parameters = z.object({
  task_id: z.string().describe("Task ID to retry"),
})

export const TaskRetryTool = Tool.define<typeof parameters, Record<string, unknown>>("task_retry", {
  description: "Retry a failed background task (only when status is manual_retry_pending)",
  parameters,
  async execute(args) {
    const projectID = Instance.project.id
    const key = ["task", projectID, args.task_id]
    const task = await Storage.read<{ status: string }>(key)
    if (!task) {
      return {
        title: "Task Retry",
        metadata: {},
        output: "Task not found",
      }
    }
    if (task.status !== "manual_retry_pending") {
      return {
        title: "Task Retry",
        metadata: {},
        output: `Task cannot be retried (status: ${task.status}). Only manual_retry_pending tasks can be retried.`,
      }
    }
    await Storage.update<Task>(key, (draft) => {
      draft.status = "pending"
      draft.retry.attempt = 0
      draft.retry.lastError = undefined
      draft.updatedAt = Date.now()
    })
    TaskRunner.run(projectID, args.task_id)
    return {
      title: "Task Retry",
      metadata: {},
      output: "Task retry started",
    }
  },
})
