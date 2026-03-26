---
description: "切换工作空间中所有项目到指定 feature 分支"
---

工作空间的项目都在 `roots/` 目录下，逐个处理每个项目：

1. `git -C <项目绝对路径> fetch --all --prune` 拉取远程
2. 获取包含 feature 的远程分支（按提交时间倒序，最多 50 个）
3. 用 `select` 工具让用户选择分支，title 用项目名，label 用远程分支名，description 用提交时间
4. 每个项目选完再处理下一个，没有 feature 分支的跳过

全部选完后批量切换：
- 本地分支名：去掉 `origin/` 前缀，`feature` 替换为 `rc`，重名则加 `-2`、`-3` 后缀
- 工作区不干净先 stash
- `git checkout -b <本地分支> <远程分支>`

最后输出汇总表格。

$ARGUMENTS
