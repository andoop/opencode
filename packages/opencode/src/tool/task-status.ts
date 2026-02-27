import { Tool } from "./tool"
import z from "zod"
import { Storage } from "@/storage/storage"
import { Instance } from "@/project/instance"

const parameters = z.object({
  task_id: z.string().describe("Task ID to query"),
})

export const TaskStatusTool = Tool.define<
  typeof parameters,
  Record<string, unknown> & { taskId?: string; taskStatus?: string; canRetry?: boolean }
>("task_status", {
  description: "Get the status of a background task",
  parameters,
  async execute(args) {
    const projectID = Instance.project.id
    const task = await Storage.read<{
      id: string
      status: string
      progress?: { current: number; total?: number; message?: string }
      retry: { lastError?: string }
    }>(["task", projectID, args.task_id])
    if (!task) {
      return {
        title: "Task Status",
        metadata: { taskId: args.task_id },
        output: "Task not found",
      }
    }
    const canRetry = task.status === "manual_retry_pending"
    const output = [
      `Status: ${task.status}`,
      task.progress ? `Progress: ${task.progress.current}${task.progress.total ? `/${task.progress.total}` : ""}${task.progress.message ? ` - ${task.progress.message}` : ""}` : "",
      task.retry.lastError ? `Error: ${task.retry.lastError}` : "",
      canRetry ? "Can retry: yes" : "",
    ]
      .filter(Boolean)
      .join("\n")
    return {
      title: "Task Status",
      metadata: { taskId: args.task_id, taskStatus: task.status, canRetry },
      output,
    }
  },
})
