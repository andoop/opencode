import { Storage } from "@/storage/storage"
import { Session } from "@/session"
import { MessageV2 } from "@/session/message-v2"
import { Bus } from "@/bus"
import { TaskRegistry, type TaskResult } from "./registry"
import type { Task } from "./types"
import { Task as TaskEvent } from "./types"
import { Log } from "@/util/log"

const log = Log.create({ service: "task.runner" })

const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000]

const abortControllers = new Map<string, AbortController>()

async function syncPart(task: Task) {
  const parts = await MessageV2.parts(task.messageID)
  const part = parts.find((p) => p.id === task.partID && p.type === "tool")
  if (!part || part.type !== "tool") return

  const baseMeta = {
    taskId: task.id,
    taskStatus: task.status,
    progress: task.progress,
    error: task.retry.lastError,
    completedAt: task.completedAt,
  }

  const input = part.state.input ?? {}
  const timeStart = part.state.status === "running" ? part.state.time.start : Date.now()

  if (task.status === "completed") {
    await Session.updatePart({
      ...part,
      state: {
        status: "completed",
        input,
        output: (task.metadata?.output as string) ?? "",
        title: task.title,
        metadata: baseMeta,
        time: { start: timeStart, end: task.completedAt ?? Date.now() },
      },
    })
    return
  }

  if (task.status === "failed" || task.status === "cancelled" || task.status === "manual_retry_pending") {
    await Session.updatePart({
      ...part,
      state: {
        status: "error",
        input,
        error: task.retry.lastError ?? "Unknown error",
        metadata: baseMeta,
        time: { start: timeStart, end: Date.now() },
      },
    })
    return
  }

  await Session.updatePart({
    ...part,
    state: {
      status: "running",
      input,
      title: task.title,
      metadata: baseMeta,
      time: { start: timeStart },
    },
  })
}

export namespace TaskRunner {
  export function abort(taskID: string) {
    const controller = abortControllers.get(taskID)
    if (controller) controller.abort()
  }

  export async function run(projectID: string, taskID: string) {
    const key = ["task", projectID, taskID]
    const task = await Storage.read<Task>(key)
    if (!task) return

    const handler = TaskRegistry.get(task.kind)
    if (!handler) {
      log.error("no handler for task kind", { kind: task.kind, taskID })
      await Storage.update<Task>(key, (draft) => {
        draft.status = "failed"
        draft.retry.lastError = `No handler for task kind: ${task.kind}`
        draft.updatedAt = Date.now()
      })
      await syncPart({ ...task, status: "failed", retry: { ...task.retry, lastError: `No handler for task kind: ${task.kind}` } })
      return
    }

    const controller = new AbortController()
    abortControllers.set(taskID, controller)

    await Storage.update<Task>(key, (draft) => {
      draft.status = "running"
      draft.updatedAt = Date.now()
    })
    await syncPart({ ...task, status: "running" })
    await Bus.publish(TaskEvent.Event.Updated, { task: { ...task, status: "running", updatedAt: Date.now() } })

    let current = await Storage.read<Task>(key)!
    let attempt = current.retry.attempt

    while (true) {
      if (controller.signal.aborted) {
        await Storage.update<Task>(key, (draft) => {
          draft.status = "cancelled"
          draft.updatedAt = Date.now()
        })
        const cancelled = await Storage.read<Task>(key)!
        await syncPart(cancelled)
        await Bus.publish(TaskEvent.Event.Updated, { task: cancelled })
        abortControllers.delete(taskID)
        return
      }

      let result: TaskResult
      try {
        result = await handler.create(current)
      } catch (e) {
        result = {
          status: "failed",
          error: e instanceof Error ? e.message : String(e),
        }
      }

      if (controller.signal.aborted) {
        await Storage.update<Task>(key, (draft) => {
          draft.status = "cancelled"
          draft.updatedAt = Date.now()
        })
        const cancelled = await Storage.read<Task>(key)!
        await syncPart(cancelled)
        await Bus.publish(TaskEvent.Event.Updated, { task: cancelled })
        abortControllers.delete(taskID)
        return
      }

      if (result.status === "completed" || result.status === "failed") {
        await Storage.update<Task>(key, (draft) => {
          draft.status = result.status
          draft.progress = result.progress
          draft.completedAt = Date.now()
          draft.updatedAt = Date.now()
          if (result.output) draft.metadata = { ...draft.metadata, output: result.output }
          if (result.error) draft.retry.lastError = result.error
        })
        const final = await Storage.read<Task>(key)!
        await syncPart(final)
        await Bus.publish(TaskEvent.Event.Updated, { task: final })
        if (result.status === "completed") await Bus.publish(TaskEvent.Event.Completed, { task: final })
        if (result.status === "failed") await Bus.publish(TaskEvent.Event.Failed, { task: final })
        abortControllers.delete(taskID)
        return
      }

      attempt++
      const maxAttempts = current.retry.maxAttempts
      if (attempt >= maxAttempts) {
        await Storage.update<Task>(key, (draft) => {
          draft.status = "manual_retry_pending"
          draft.retry.attempt = attempt
          draft.retry.lastError = result.error ?? draft.retry.lastError ?? "Max retries exceeded"
          draft.updatedAt = Date.now()
        })
        const pending = await Storage.read<Task>(key)!
        await syncPart(pending)
        await Bus.publish(TaskEvent.Event.Updated, { task: pending })
        abortControllers.delete(taskID)
        return
      }

      const delay = RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)]
      await Storage.update<Task>(key, (draft) => {
        draft.retry.attempt = attempt
        draft.retry.lastError = result.error
        draft.updatedAt = Date.now()
      })
      current = await Storage.read<Task>(key)!
      await syncPart(current)
      await Bus.publish(TaskEvent.Event.Updated, { task: current })
      await new Promise((r) => setTimeout(r, delay))
    }
  }
}
