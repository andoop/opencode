---
description: "commit、push 并输出 MR/PR 地址"
---

将本地改动 commit 并 push 到远端同名分支，最后给出 MR/PR 地址。

## 步骤

### 1. 检查状态

运行 `git status --short`，如果没有任何改动（暂存 + 未暂存 + 未跟踪），直接告诉用户"没有需要提交的改动"并结束。

### 2. 生成 commit message

根据下方的 diff 信息，生成一条简洁的 commit message：

- 格式：`<prefix>: <描述>`
- prefix 规则：
  - `packages/web` 相关 → `docs:`
  - `packages/app` 相关 → `ignore:`
  - `packages/opencode/src/tui` 相关 → `tui:`
  - CI/CD 相关 → `ci:`
  - 其他 → `core:`
  - 多个模块混合改动 → 用最主要的 prefix
- 描述要从**用户视角**说明 WHY，不要泛泛而谈

如果用户通过 $ARGUMENTS 传入了 commit message，则直接使用用户提供的 message，不再自动生成。

### 3. 暂存 & 提交

```
git add -A
git commit -m "<message>"
```

### 4. Pull rebase

```
git pull --rebase
```

如果出现冲突，**不要尝试解决**，告知用户并停止后续步骤。

### 5. Push

获取当前分支名后推送：

```
git push -u origin HEAD
```

如果远端还没有该分支，用上面的命令会自动创建。

### 6. 输出 MR/PR 地址

push 完成后：

1. 通过 `git remote get-url origin` 获取远程地址
2. 判断平台：
   - **GitHub**（含 `github.com`）：
     - 用 `gh pr list --head <branch> --json url --jq '.[0].url'` 查找已有 PR
     - 如果已有 PR，输出该 PR 地址
     - 如果没有，输出创建 PR 的地址：`https://github.com/<owner>/<repo>/compare/<default_branch>...<branch>?expand=1`
   - **GitLab**（含 `gitlab`）：
     - 从 push 输出中提取 MR 链接（GitLab push 时通常会返回）
     - 如果没有，输出创建 MR 的地址：`https://<host>/<owner>/<repo>/-/merge_requests/new?merge_request[source_branch]=<branch>`

最终以醒目格式输出链接，例如：

```
✅ 已推送到 origin/<branch>
🔗 PR: <url>
```

## GIT DIFF

!`git diff`

## GIT DIFF --cached

!`git diff --cached`

## GIT STATUS --short

!`git status --short`
