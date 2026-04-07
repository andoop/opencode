# 需求文档

## 简介

在创建新会话（Session）时，增加一个分支选择流程。用户可以为工作区中的每一个项目选择基础分支，系统基于用户选择的分支创建带有时间后缀的 git worktree。该功能支持分支列表刷新、搜索过滤，以及分支名冲突时的手动输入。

## 术语表

- **Session**: 一次独立的工作会话，包含独立的 git worktree 工作目录
- **Branch_Selector**: 分支选择器组件，在创建会话时为每个项目提供分支选择界面
- **Workspace**: 工作区，包含一个或多个项目（Project）的集合
- **Project**: 工作区中的一个 git 仓库项目
- **Worktree**: git worktree，基于指定分支创建的独立工作目录
- **Time_Suffix**: 时间后缀，格式为 `YYMMDDHHmm`（如 `2604021136` 代表 26年4月2日11点36分）
- **Base_Branch**: 用户为某个项目选择的基础分支，worktree 将基于该分支创建

## 需求

### 需求 1：会话创建时展示分支选择流程

**用户故事：** 作为开发者，我希望在创建新会话时能为每个项目选择基础分支，以便在正确的代码基线上开始工作。

#### 验收标准

1. WHEN 用户创建新会话, THE Branch_Selector SHALL 为 Workspace 中每一个 vcs 类型为 "git" 的 Project 展示分支选择界面
2. THE Branch_Selector SHALL 默认选中每个 Project 当前所在的分支
3. WHEN 某个 Project 的 vcs 类型不是 "git", THE Branch_Selector SHALL 跳过该 Project 的分支选择
4. WHEN 用户完成所有项目的分支选择, THE Session SHALL 使用用户选择的分支作为 Base_Branch 创建 Worktree

### 需求 2：分支列表展示与刷新

**用户故事：** 作为开发者，我希望能看到所有可用分支并刷新列表，以便获取最新的远程分支信息。

#### 验收标准

1. THE Branch_Selector SHALL 展示每个 Project 的本地分支和远程分支列表
2. WHEN 用户触发刷新操作, THE Branch_Selector SHALL 重新获取该 Project 的分支列表并更新展示
3. WHEN 刷新操作执行前, THE Branch_Selector SHALL 执行 `git fetch` 以同步远程分支信息
4. IF 获取分支列表失败, THEN THE Branch_Selector SHALL 显示错误信息并保留上一次的分支列表

### 需求 3：分支搜索过滤

**用户故事：** 作为开发者，我希望能通过关键词搜索分支，以便在大量分支中快速找到目标分支。

#### 验收标准

1. THE Branch_Selector SHALL 提供文本输入框用于搜索过滤分支列表
2. WHEN 用户输入搜索关键词, THE Branch_Selector SHALL 对分支名称进行模糊匹配并实时过滤展示结果
3. WHEN 搜索结果为空, THE Branch_Selector SHALL 显示无匹配分支的提示信息

### 需求 4：基于选择的分支创建带时间后缀的 Worktree

**用户故事：** 作为开发者，我希望创建的 worktree 分支名带有时间后缀，以便区分不同时间创建的会话分支。

#### 验收标准

1. WHEN 创建 Session Worktree, THE Session SHALL 使用格式 `session/{sessionID}` 作为 worktree 分支名，其中 sessionID 包含 Time_Suffix
2. THE Time_Suffix SHALL 使用 `YYMMDDHHmm` 格式（两位年份、两位月份、两位日期、两位小时、两位分钟）
3. WHEN 创建 Worktree, THE Session SHALL 基于用户选择的 Base_Branch 的 HEAD commit 创建新分支
4. THE Session SHALL 将用户选择的 Base_Branch 记录到 SessionRoot 的 baseBranch 字段中

### 需求 5：分支名冲突处理

**用户故事：** 作为开发者，当自动生成的分支名已存在时，我希望能手动输入分支名，以避免冲突。

#### 验收标准

1. IF 自动生成的分支名在目标 Project 中已存在, THEN THE Branch_Selector SHALL 提示用户该分支名已被占用
2. WHEN 分支名冲突发生, THE Branch_Selector SHALL 提供文本输入框让用户手动输入替代分支名
3. WHEN 用户输入自定义分支名, THE Branch_Selector SHALL 验证该名称在目标 Project 中不存在
4. IF 用户输入的自定义分支名仍然冲突, THEN THE Branch_Selector SHALL 再次提示用户重新输入
5. THE Branch_Selector SHALL 对用户输入的分支名进行合法性校验，确保符合 git 分支命名规则
