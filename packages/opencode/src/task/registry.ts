import type { Task } from "./types"

export type TaskResult = {
  status: Task["status"]
  progress?: Task["progress"]
  output?: string
  error?: string
}

export type TaskKindHandler = {
  create(task: Task): Promise<TaskResult>
  poll?(task: Task): Promise<TaskResult>
  retry?(task: Task): Promise<void>
}

const registry = new Map<string, TaskKindHandler>()

export namespace TaskRegistry {
  export function register(kind: string, handler: TaskKindHandler) {
    registry.set(kind, handler)
  }
  export function get(kind: string): TaskKindHandler | undefined {
    return registry.get(kind)
  }
  export function has(kind: string): boolean {
    return registry.has(kind)
  }
  export function kinds(): string[] {
    return Array.from(registry.keys())
  }
}
