import type { Task } from "../types"
import { TaskRegistry } from "../registry"

const DURATION_MS = 30_000

TaskRegistry.register("slow", {
  async create() {
    await new Promise((r) => setTimeout(r, DURATION_MS))
    return { status: "completed", output: "30s test task completed" }
  },
})
