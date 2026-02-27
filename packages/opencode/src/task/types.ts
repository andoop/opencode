import z from "zod"
import { BusEvent } from "@/bus/bus-event"

export const TaskStatus = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
  "manual_retry_pending",
])
export type TaskStatus = z.infer<typeof TaskStatus>

export const TaskProgress = z.object({
  current: z.number(),
  total: z.number().optional(),
  message: z.string().optional(),
})
export type TaskProgress = z.infer<typeof TaskProgress>

export const TaskRetry = z.object({
  attempt: z.number(),
  maxAttempts: z.number(),
  lastError: z.string().optional(),
})
export type TaskRetry = z.infer<typeof TaskRetry>

export const TaskSchema = z.object({
  id: z.string(),
  sessionID: z.string(),
  messageID: z.string(),
  partID: z.string(),
  kind: z.string(),
  title: z.string(),
  status: TaskStatus,
  progress: TaskProgress.optional(),
  retry: TaskRetry,
  externalRef: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  completedAt: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type Task = z.infer<typeof TaskSchema>

export namespace Task {
  export const Event = {
    Created: BusEvent.define("task.created", z.object({ task: TaskSchema })),
    Updated: BusEvent.define("task.updated", z.object({ task: TaskSchema })),
    Completed: BusEvent.define("task.completed", z.object({ task: TaskSchema })),
    Failed: BusEvent.define("task.failed", z.object({ task: TaskSchema })),
    RecoveryPending: BusEvent.define(
      "task.recovery_pending",
      z.object({ taskIds: z.array(z.string()) }),
    ),
  }
}
