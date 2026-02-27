import type { Task } from "../types"
import { TaskRegistry } from "../registry"

TaskRegistry.register("generic", {
  async create() {
    return { status: "completed", output: "Task completed" }
  },
})
