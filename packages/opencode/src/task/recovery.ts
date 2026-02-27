import { Storage } from "@/storage/storage"
import { Bus } from "@/bus"
import { Instance } from "@/project/instance"
import { TaskRunner } from "./runner"
import type { Task } from "./types"
import { Task as TaskEvent } from "./types"

export async function init() {
  const projectID = Instance.project.id
  const keys = await Storage.list(["task", projectID]).catch(() => [])
  const taskIds: string[] = []

  for (const key of keys) {
    const taskID = key[key.length - 1]
    const task = await Storage.read<Task>(["task", projectID, taskID]).catch(() => undefined)
    if (!task) continue

    if (task.status === "running") {
      await Storage.update<Task>(["task", projectID, taskID], (draft) => {
        draft.status = "manual_retry_pending"
        draft.retry.lastError = "Service restarted. Please retry manually."
        draft.updatedAt = Date.now()
      })
      taskIds.push(taskID)
    } else if (task.status === "pending") {
      TaskRunner.run(projectID, taskID)
    }
  }

  if (taskIds.length > 0) {
    await Bus.publish(TaskEvent.Event.RecoveryPending, { taskIds })
  }
}
