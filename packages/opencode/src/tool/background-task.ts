import "@/task/kinds/generic"
import "@/task/kinds/slow"
import { Tool } from "./tool"
import z from "zod"
import { Storage } from "@/storage/storage"
import { Identifier } from "@/id/id"
import { Instance } from "@/project/instance"
import { TaskRunner } from "@/task/runner"
import type { Task } from "@/task/types"

const parameters = z.object({
  kind: z.string().default("generic").describe("Task type (e.g. generic, slow, api_poll)"),
  title: z.string().describe("Task title"),
  params: z.record(z.string(), z.unknown()).optional().describe("Optional task parameters"),
})

export const BackgroundTaskTool = Tool.define<
  typeof parameters,
  Record<string, unknown> & { taskId?: string }
>("background-task", {
  description: "Start a background task that runs asynchronously. Returns immediately with a task ID; use task_status to check progress.",
  parameters,
  async execute(args, ctx) {
    // partID from processor; callID fallback when partFromToolCall returns undefined (e.g. different provider)
    const partID = ctx.partID ?? ctx.callID
    if (!partID) throw new Error("background-task requires partID or callID in context")
    const projectID = Instance.project.id
    const taskID = Identifier.ascending("task")
    const now = Date.now()
    const task: Task = {
      id: taskID,
      sessionID: ctx.sessionID,
      messageID: ctx.messageID,
      partID,
      kind: args.kind,
      title: args.title,
      status: "pending",
      retry: { attempt: 0, maxAttempts: 5 },
      createdAt: now,
      updatedAt: now,
      metadata: args.params,
    }
    await Storage.write(["task", projectID, taskID], task)
    await ctx.metadata({ title: args.title, metadata: { taskId: taskID, taskStatus: "pending" } })
    TaskRunner.run(projectID, taskID)
    return {
      title: args.title,
      metadata: { taskId: taskID, task_id: taskID },
      output: `Task started in background. task_id: ${taskID}`,
    }
  },
})
