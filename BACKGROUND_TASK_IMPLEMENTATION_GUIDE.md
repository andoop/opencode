# 后台任务系统实现指南

本文档描述如何在 OpenCode 类项目中实现后台任务系统。适用于 AI 聊天场景：用户/AI 发起长时间任务后，任务在后台执行，聊天中显示可实时更新的任务卡片；支持自动重试、手动重试、服务重启恢复；支持通过 API 轮询外部服务。

---

## 一、架构依赖

项目需具备以下能力（按 OpenCode 架构）：

- **Storage**：键值存储，支持 `read`、`write`、`update`、`list`，路径如 `["task", projectID, taskID]`
- **Bus**：事件总线，支持 `publish`、`subscribe`，事件带 schema（如 `BusEvent.define`）
- **Session**：会话管理，`Session.get(sessionID)` 返回 `{ directory, projectID }`
- **MessageV2**：消息与 Part，`MessageV2.get`、`MessageV2.parts`、`Session.updatePart`
- **Instance**：按目录懒加载，`Instance.provide({ directory, fn })`、`Instance.project.id`
- **Tool**：工具定义，`Tool.define(id, init)`，Context 含 `sessionID`、`messageID`、`partID`、`metadata()`
- **Identifier**：ID 生成，需支持 `task` 前缀（如 `tsk_xxx`）

---

## 二、数据模型

### 2.1 任务状态与类型

```typescript
// 任务状态
type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled" | "manual_retry_pending"

// 任务类型（可扩展）
type TaskKind = "generic" | "api_poll" | "jenkins_build" | ...
```

### 2.2 任务实体 (Task)

存储路径: `["task", projectID, taskID]`

```typescript
interface Task {
  id: string
  sessionID: string
  messageID: string
  partID: string // 关联的 ToolPart ID（任务卡片）
  kind: string
  title: string
  status: TaskStatus
  progress?: { current: number; total?: number; message?: string }
  retry: { attempt: number; maxAttempts: number; lastError?: string }
  externalRef?: string // 外部服务任务 ID，用于 api_poll 类型
  createdAt: number
  updatedAt: number
  completedAt?: number
  metadata: Record<string, unknown>
}
```

### 2.3 任务与 Part 的关联

- 复用 `ToolPart`，工具名为 `background-task`
- `part.state.metadata.taskId` 指向任务 ID
- `part.state.metadata.taskStatus`、`progress`、`error` 等由 TaskRunner 同步

---

## 三、文件与实现

### 3.1 任务类型定义 `task/types.ts`

```typescript
import z from "zod"
import { BusEvent } from "@/bus/bus-event" // 或项目内 Bus 事件定义方式

export const TaskStatus = z.enum(["pending", "running", "completed", "failed", "cancelled", "manual_retry_pending"])
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
  metadata: z.record(z.string(), z.any()).optional(),
})
export type Task = z.infer<typeof TaskSchema>

export namespace Task {
  export const Event = {
    Created: BusEvent.define("task.created", z.object({ task: TaskSchema })),
    Updated: BusEvent.define("task.updated", z.object({ task: TaskSchema })),
    Completed: BusEvent.define("task.completed", z.object({ task: TaskSchema })),
    Failed: BusEvent.define("task.failed", z.object({ task: TaskSchema })),
    RecoveryPending: BusEvent.define("task.recovery_pending", z.object({ taskIds: z.array(z.string()) })),
  }
}
```

### 3.2 ID 生成器扩展

在 `id/id.ts` 中增加 `task` 前缀：

```typescript
const prefixes = {
  // ... 其他
  task: "tsk",
} as const
```

### 3.3 任务注册表 `task/registry.ts`

```typescript
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
```

### 3.4 任务运行器 `task/runner.ts`

核心逻辑：

1. 从 Storage 读取任务，按 `task.kind` 获取 handler
2. 设置 `status: "running"`，调用 `syncPart` 同步到 Part
3. 调用 `handler.create(task)` 执行
4. 若 `controller.signal.aborted`，置为 `cancelled`
5. 成功则更新 `status`、`progress`、`output`、`completedAt`
6. 失败则按 `retry.attempt` 指数退避重试，达到 `maxAttempts` 置为 `manual_retry_pending`
7. 每次更新后 `syncPart` + `Bus.publish(Task.Event.Updated)`

`syncPart` 逻辑：

- 通过 `Session.get(task.sessionID)` 获取 directory
- 在 `Instance.provide({ directory, fn })` 内：
  - `MessageV2.get`、`MessageV2.parts` 找到对应 ToolPart
  - 根据 `task.status` 构造 Part 的 `state`（`status`、`metadata`、`output` 等）
  - 调用 `Session.updatePart` 更新

重试延迟建议：`[1000, 2000, 4000, 8000, 16000]` 毫秒。

需支持 `TaskRunner.run(projectID, taskID)` 和 `TaskRunner.abort(taskID)`（通过 AbortController）。

### 3.5 generic 任务类型 `task/kinds/generic.ts`

```typescript
import type { Task } from "../types"
import { TaskRegistry } from "../registry"

TaskRegistry.register("generic", {
  async create(task) {
    return { status: "completed", output: "Task completed" }
  },
})
```

### 3.6 任务恢复 `task/recovery.ts`

在 Instance 首次加载时调用（如 bootstrap）：

```typescript
export async function init() {
  const projectID = Instance.project.id
  const keys = await Storage.list(["task", projectID]).catch(() => [])

  for (const key of keys) {
    const taskID = key[key.length - 1]
    const task = await Storage.read<Task>(["task", projectID, taskID]).catch(() => undefined)
    if (!task) continue

    if (task.status === "running") {
      await Storage.update(["task", projectID, taskID], (draft) => {
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
    Bus.publish(Task.Event.RecoveryPending, { taskIds })
  }
}
```

### 3.7 创建任务工具 `tool/background-task.ts`

- 参数：`kind`、`title`、`params`（可选）
- 需要 `ctx.partID`，否则抛错
- 生成 `taskID`（如 `Identifier.ascending("task")`）
- 写入 Storage `["task", projectID, taskID]`
- 调用 `ctx.metadata({ title, metadata: { taskId, taskStatus: "pending" } })`
- 调用 `TaskRunner.run(projectID, taskID)`（不 await）
- 返回 `{ title, metadata: { taskId }, output }`

### 3.8 查询/重试/取消工具

- **task_status**：参数 `task_id`，从 Storage 读取任务，返回状态、进度、错误、是否可重试
- **task_retry**：参数 `task_id`，仅当 `status === "manual_retry_pending"` 时，重置为 `pending` 并 `TaskRunner.run`
- **task_cancel**：参数 `task_id`，仅当 `status === "running"` 时，调用 `TaskRunner.abort`

工具若返回多种 metadata 形状（如 `{}` 与 `{ taskId, status }`），需显式指定 metadata 类型，例如：

```typescript
Tool.define<typeof parameters, Record<string, unknown>>("task_status", async () => ({ ... }))
```

### 3.9 Tool Context 扩展

在工具调用的 context 中增加 `partID`，例如：

```typescript
partID: input.processor.partFromToolCall(options.toolCallId)?.id
```

确保 `Tool.Context` 类型包含 `partID?: string`。

### 3.10 Bootstrap 集成

在 Instance 启动/首次加载时调用：

```typescript
import { init as TaskRecoveryInit } from "../task/recovery"
// 在 bootstrap 函数内：
await TaskRecoveryInit()
```

### 3.11 任务 API 路由

需在 Instance 作用域内（通过 query/header 的 `directory` 确定 Instance）：

- `GET /task/:taskId` — 返回任务详情
- `POST /task/:taskId/retry` — 手动重试（仅 `manual_retry_pending`）
- `POST /task/:taskId/cancel` — 取消（仅 `running`）

路由需使用 `Instance.project.id` 和 `Storage` 读写任务。

### 3.12 工具注册

在工具注册表中加入：

- `BackgroundTaskTool`
- `TaskStatusTool`
- `TaskRetryTool`
- `TaskCancelTool`

并确保在 `background-task` 工具中 `import "@/task/kinds/generic"` 以注册 generic 类型。

---

## 四、前端

### 4.1 任务卡片 UI（Web）

在 ToolRegistry 中注册 `background-task`：

```typescript
ToolRegistry.register({
  name: "background-task",
  render(props) {
    const taskId = () => props.metadata?.taskId
    const taskStatus = () => props.metadata?.taskStatus ?? props.status
    const progress = () => props.metadata?.progress
    const error = () => props.metadata?.error
    const canRetry = () => taskStatus() === "manual_retry_pending"
    const canCancel = () => taskStatus() === "running"

    // 显示：标题、状态、进度条、错误信息
    // 按钮：Retry（manual_retry_pending）、Cancel（running）
    // 通过 data.onTaskRetry、data.onTaskCancel 调用 API
  },
})
```

### 4.2 DataProvider 扩展

在 Data 上下文中增加：

```typescript
onTaskRetry?: (taskId: string) => Promise<void>
onTaskCancel?: (taskId: string) => Promise<void>
```

### 4.3 布局层调用

在目录布局/会话布局中，实现 `onTaskRetry`、`onTaskCancel`，调用：

```
POST {sdk.url}/task/{taskId}/retry?directory={encodeURIComponent(directory)}
POST {sdk.url}/task/{taskId}/cancel?directory={encodeURIComponent(directory)}
```

注意：`platform.fetch` 可能为 undefined，使用 `platform.fetch ?? fetch`。

### 4.4 TUI 支持（如有）

在 TUI 的 part 渲染中增加 `background-task` 分支，显示简化版任务状态。

---

## 附录：关键代码参考

### A. TaskRunner 核心流程（伪代码）

```typescript
async function runTask(projectID: string, taskID: string) {
  const task = await Storage.read(["task", projectID, taskID])
  const handler = TaskRegistry.get(task.kind)
  const controller = new AbortController()
  abortControllers.set(taskID, controller)

  await Storage.update(..., draft => { draft.status = "running" })
  await syncPart(task)
  Bus.publish(Task.Event.Updated, { task })

  const result = await handler.create(task)

  if (controller.signal.aborted) {
    await Storage.update(..., draft => { draft.status = "cancelled" })
    await syncPart(cancelled)
    return
  }

  await Storage.update(..., draft => {
    draft.status = result.status
    draft.progress = result.progress
    draft.completedAt = Date.now()
    if (result.output) draft.metadata.output = result.output
    if (result.error) draft.retry.lastError = result.error
  })
  await syncPart(final)
  Bus.publish(Task.Event.Updated, { task: final })
}
```

### B. syncPart 状态映射

- `completed` → Part `status: "completed"`, `output` 来自 `task.metadata.output`
- `failed` / `cancelled` / `manual_retry_pending` → Part `status: "error"`, `error` 来自 `task.retry.lastError`
- `pending` / `running` → Part `status: "running"`

metadata 统一包含：`taskId`, `taskStatus`, `progress`, `error`, `completedAt`。

### C. 服务器路由挂载

```typescript
.route("/task", TaskRoutes())
```

路由需在 Instance 中间件之后，确保 `Instance.project.id` 可用。

---

## 五、实现顺序建议

1. 任务模型与存储（types、ID 前缀、Storage 路径）
2. TaskRegistry + TaskRunner + generic kind
3. BackgroundTaskTool + TaskStatusTool + TaskRetryTool + TaskCancelTool
4. Part 更新链路（syncPart、Bus 事件）
5. 任务卡片 UI + DataProvider + 布局层 API 调用
6. 重试逻辑 + TaskRecovery + bootstrap
7. 任务 API 路由
8. （可选）api_poll、jenkins_build 等扩展类型
9. （可选）AI 进度通知（synthetic 消息）

---

## 六、注意事项

- **孤儿任务**：Part 被删除时，Task 可能成为孤儿。syncPart 中若找不到 Part，应跳过 `Session.updatePart`，仅更新 Storage。
- **任务卡片恢复**：Part 的 metadata 持久化任务快照，用户重新登录后优先用 Part 渲染；若状态非终态，可再请求 `GET /task/:id` 更新。
- **API 作用域**：任务 API 需依赖 `directory` 确定 Instance，与 session 等路由一致。

---

## 七、扩展新任务类型示例（如 jenkins_build）

```typescript
// task/kinds/jenkins_build.ts
import type { Task } from "../types"
import { TaskRegistry } from "../registry"

TaskRegistry.register("jenkins_build", {
  async create(task) {
    const { jobUrl, buildParams } = task.metadata as { jobUrl: string; buildParams?: Record<string, string> }
    // 1. 调用 Jenkins API 触发构建，获得 buildNumber
    // 2. 轮询构建状态，或使用 webhook
    // 3. 返回 { status: "completed"|"failed", output, progress }
    return { status: "completed", output: "Build finished" }
  },
})
```

在 `background-task` 工具中 import 该文件以注册。
