import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { Storage } from "@/storage/storage"
import { Instance } from "@/project/instance"
import { TaskRunner } from "@/task/runner"
import { Task, TaskSchema } from "@/task/types"
import { lazy } from "@/util/lazy"

export const TaskRoutes = lazy(() =>
  new Hono()
    .get(
      "/:taskId",
      describeRoute({
        summary: "Get task",
        description: "Get task details by ID. Requires directory in query or header.",
        operationId: "task.get",
        responses: {
          200: {
            description: "Task details",
            content: {
              "application/json": {
                schema: resolver(TaskSchema),
              },
            },
          },
          404: {
            description: "Task not found",
          },
        },
      }),
      validator("param", z.object({ taskId: z.string() })),
      async (c) => {
        const { taskId } = c.req.valid("param")
        const projectID = Instance.project.id
        const task = await Storage.read<Task>(["task", projectID, taskId])
        if (!task) return c.json({ error: "Task not found" }, 404)
        return c.json(task)
      },
    )
    .post(
      "/:taskId/retry",
      describeRoute({
        summary: "Retry task",
        description: "Retry a task with status manual_retry_pending. Requires directory in query or header.",
        operationId: "task.retry",
        responses: {
          200: {
            description: "Retry started",
            content: {
              "application/json": {
                schema: resolver(z.object({ ok: z.literal(true) })),
              },
            },
          },
          400: {
            description: "Task cannot be retried",
          },
          404: {
            description: "Task not found",
          },
        },
      }),
      validator("param", z.object({ taskId: z.string() })),
      async (c) => {
        const { taskId } = c.req.valid("param")
        const projectID = Instance.project.id
        const key = ["task", projectID, taskId]
        const task = await Storage.read<Task>(key)
        if (!task) return c.json({ error: "Task not found" }, 404)
        if (task.status !== "manual_retry_pending") {
          return c.json({ error: `Task cannot be retried (status: ${task.status})` }, 400)
        }
        await Storage.update<Task>(key, (draft) => {
          draft.status = "pending"
          draft.retry.attempt = 0
          draft.retry.lastError = undefined
          draft.updatedAt = Date.now()
        })
        TaskRunner.run(projectID, taskId)
        return c.json({ ok: true })
      },
    )
    .post(
      "/:taskId/cancel",
      describeRoute({
        summary: "Cancel task",
        description: "Cancel a running task. Requires directory in query or header.",
        operationId: "task.cancel",
        responses: {
          200: {
            description: "Cancel requested",
            content: {
              "application/json": {
                schema: resolver(z.object({ ok: z.literal(true) })),
              },
            },
          },
          400: {
            description: "Task cannot be cancelled",
          },
          404: {
            description: "Task not found",
          },
        },
      }),
      validator("param", z.object({ taskId: z.string() })),
      async (c) => {
        const { taskId } = c.req.valid("param")
        const projectID = Instance.project.id
        const task = await Storage.read<Task>(["task", projectID, taskId])
        if (!task) return c.json({ error: "Task not found" }, 404)
        if (task.status !== "running") {
          return c.json({ error: `Task cannot be cancelled (status: ${task.status})` }, 400)
        }
        TaskRunner.abort(taskId)
        return c.json({ ok: true })
      },
    ),
)
