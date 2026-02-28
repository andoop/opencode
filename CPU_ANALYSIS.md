# OpenCode Web CPU 占用分析

## 已确认的高 CPU 来源

### 1. 终端渲染循环 (最可能的主因)

**位置**: `packages/app/src/components/terminal.tsx` + ghostty-web

**问题**: ghostty-web 内部有 `startRenderLoop()`，以 `requestAnimationFrame` 持续渲染 canvas。在高刷新率显示器（120Hz/144Hz）上，每台终端每秒渲染 120–144 次，CPU 占用会很高。

**状态**: 已实现 FPS 限制（默认 15 FPS）。ghostty-web 0.3.0 中存在 `startRenderLoop`，补丁会生效，终端渲染已从显示器刷新率（60–144 FPS）限制为默认 15 FPS。

**验证**: 在设置中检查 Terminal FPS 是否为 15；若为 0 则无限制。

---

### 2. SessionTurn 的 setInterval(1000)

**位置**: `packages/ui/src/components/session-turn.tsx` 第 528、542 行

**问题**:
- **retry 倒计时**: 每个有 retry 的 turn 会跑 `setInterval(updateSeconds, 1000)`
- **duration 计时**: 正在工作的 turn 会跑 `setInterval(update, 1000)`

若会话中有 10 个可 retry 的 turn，就有 10 个 1 秒定时器，每个都会触发 `setStore` 和重渲染。

**影响**: 中等。每个定时器每秒 1 次更新，但会触发 Solid 的响应式更新。

---

### 3. 无虚拟化的消息列表

**位置**: `packages/app/src/pages/session.tsx` 第 2309 行

**问题**: 使用 `<For each={renderedUserMessages()}>` 渲染所有消息，没有虚拟化。50 条消息 = 50 个 SessionTurn 组件，每个都有：
- createEffect
- createResizeObserver
- createAutoScroll
- 多个 createMemo

**影响**: 消息多时，挂载的组件和 effect 数量会明显增加。

---

### 4. 其他定时器（影响较小）

| 位置 | 间隔 | 说明 |
|------|------|------|
| status-popover.tsx | 10s | 健康检查 |
| dialog-select-server.tsx | 10s | 健康检查 |
| server.tsx | 10s | 服务检查 |
| auth.tsx | 20min | token 刷新 |
| layout.tsx | 10min | 更新检查 |
| prompt-input.tsx | 6.5s | placeholder 轮换 |

---

## 建议的排查步骤

### 1. 用 Chrome DevTools 做 CPU 分析

1. 打开 OpenCode web
2. F12 → Performance
3. 点击 Record，等待 10–15 秒（尽量保持页面静止）
4. 停止录制
5. 在 Summary 中查看占用最高的函数（如 `requestAnimationFrame`、`render`、`setInterval` 回调）

### 2. 快速验证终端是否为瓶颈

1. 打开设置 → Appearance → Terminal FPS，设为 **5**
2. 打开一个终端，观察 CPU 是否下降
3. 若明显下降，说明终端渲染是主要来源

### 3. 检查定时器数量

在控制台执行：

```js
// 查看当前 setInterval 数量（近似）
let count = 0
const orig = window.setInterval
window.setInterval = function(...args) {
  count++
  console.log('setInterval #', count, args[1])
  return orig.apply(this, args)
}
```

---

## 建议的优化方向

1. **终端 FPS**: 已实现，确认默认 15 FPS 生效；可考虑默认 10 以进一步降低 CPU
2. **SessionTurn retry 定时器**: 仅在 retry UI 可见时启动，或合并多个 retry 的更新
3. **消息列表虚拟化**: 使用 virtua 等库，只渲染可见消息
4. **duration 更新**: 可改为 2–5 秒更新一次，或仅在 tab 可见时更新
