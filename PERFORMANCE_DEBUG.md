# 性能调试指南

## 已完成的优化

1. **bootstrapInstance 去重**：跳过已完成的目录，避免重复执行 git 操作
2. **避免重复 bootstrap**：在多个地方使用 `bootstrap: false` 参数
3. **Git 信息懒加载**：只在点击 Git Info 时才加载详细分支信息
4. **文件监听器事件防抖**：批量处理文件变化事件，避免频繁调用 `listDir()`（300ms 防抖）
   - 使用 Set 去重，同一目录的多次变化只刷新一次
   - 批量处理文件重载和目录刷新

## 排查步骤

### 1. 检查定时器数量

在浏览器控制台执行：

```javascript
// 查看当前 setInterval 数量
let count = 0
const orig = window.setInterval
window.setInterval = function(...args) {
  count++
  console.log('setInterval #', count, 'interval:', args[1], 'ms')
  return orig.apply(this, args)
}

// 查看当前 requestAnimationFrame 数量
let rafCount = 0
const origRAF = window.requestAnimationFrame
window.requestAnimationFrame = function(...args) {
  rafCount++
  console.log('requestAnimationFrame #', rafCount)
  return origRAF.apply(this, args)
}
```

### 2. Chrome DevTools Performance 分析

1. 打开 OpenCode web
2. F12 → Performance 标签
3. 点击 Record（圆形按钮）
4. 等待 10-15 秒（保持页面静止）
5. 停止录制
6. 在 Summary 中查看：
   - 占用最高的函数（如 `requestAnimationFrame`、`render`、`setInterval` 回调）
   - 火焰图中查看哪些函数调用最频繁

### 3. 检查响应式更新

在浏览器控制台执行：

```javascript
// 监控 SolidJS 的响应式更新
const orig = Solid.createEffect
Solid.createEffect = function(fn) {
  const wrapped = () => {
    console.trace('Effect triggered')
    return fn()
  }
  return orig(wrapped)
}
```

### 4. 检查网络请求

在 Network 标签中：
- 查看是否有频繁的 `/vcs` 请求
- 查看是否有频繁的 `/session` 请求
- 查看是否有频繁的 WebSocket 消息

### 5. 检查文件监听器

如果有多个 worktree，每个 worktree 可能都有文件监听器。检查：
- 打开了多少个会话
- 每个会话是否都有独立的 worktree
- 文件监听器是否在频繁触发

### 6. 已知的高 CPU 使用源

根据 `CPU_ANALYSIS.md`：

1. **终端渲染循环** (`packages/app/src/components/terminal.tsx` + `ghostty-web`)
   - 使用 `requestAnimationFrame` 持续渲染
   - 如果有多个终端标签页，每个都会运行

2. **SessionTurn 定时器** (`packages/ui/src/components/session-turn.tsx`)
   - 每个消息都有一个 `setInterval(1000)` 用于倒计时
   - 如果有 50 个消息，就有 50 个定时器

3. **非虚拟化的消息列表** (`packages/app/src/pages/session.tsx`)
   - 如果有很多消息，会渲染很多 `SessionTurn` 组件
   - 每个组件都有自己的定时器

4. **文件监听器事件** (`packages/app/src/context/file.tsx`) - **已优化**
   - 文件多的项目会有大量文件变化事件
   - 已添加防抖机制（300ms）和批量处理
   - 同一目录的多次变化只刷新一次

## 建议的进一步优化

1. **虚拟化消息列表**：只渲染可见的消息
2. **减少 SessionTurn 定时器**：使用单个全局定时器更新所有倒计时
3. **优化终端渲染**：减少 `requestAnimationFrame` 的频率或使用更高效的渲染方式
4. **限制文件监听器**：只在需要时监听文件变化
