---
description: "切换工作空间中所有项目到指定 feature 分支"
---

工作空间的项目都在 `roots/` 目录下，逐个处理每个项目：

1. `git -C <项目绝对路径> fetch --all --prune` 拉取远程
2. 获取包含 feature 的远程分支（按提交时间倒序，最多 50 个）
3. 调用 select 工具让用户选择分支（**必须按下面的格式调用，不要跳过**）
4. 等 select 返回结果后再处理下一个项目，没有 feature 分支的跳过

## 调用 select 的具体方式

**必须**通过工具调用让用户选择，**禁止**跳过工具、输出 JSON、或让用户手动回复。

如果工具名叫 `select`，直接调用 `select`。
如果工具名叫 `opencode_select`，按 XML 协议调用，格式如下：

```
<opencode_tool_call name="opencode_select">{"title":"capture-android","options":[{"label":"origin/feature/3.63","description":"2025-06-15 14:30"},{"label":"origin/feature/3.62","description":"2025-06-10 09:20"}]}</opencode_tool_call>
```

参数说明：
- `title`：项目名称
- `options`：完整分支列表（不要截断），每项 `label` 为远程分支全名，`description` 为提交时间

调用后**阻塞等待**用户选择结果，拿到结果后再处理下一个项目。

## 切换规则

全部选完后批量切换：
- 本地分支名：去掉 `origin/` 前缀，`feature` 替换为 `rc`，重名则加 `-2`、`-3` 后缀
- 工作区不干净先 stash
- `git checkout -b <本地分支> <远程分支>`

最后输出汇总表格。

$ARGUMENTS
