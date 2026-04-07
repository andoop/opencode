# 实现计划：Session Branch Selector

## 概述

在 Web 端会话创建流程中增加分支选择步骤。后端新增 Branch 模块和 API 路由，修改 Session 创建流程以接受 baseBranch 参数；前端新增 DialogSelectBranch 对话框组件，集成到 layout.tsx 的 createSession 流程中。最后重新生成 SDK。

## 任务

- [x] 1. 实现 Branch 模块
  - [x] 1.1 创建 `packages/opencode/src/branch/index.ts`，实现 `Branch` 命名空间
    - 实现 `list(directory)` 函数：通过 `git branch --list` 和 `git branch -r` 获取本地和远程分支列表，通过 `git rev-parse --abbrev-ref HEAD` 获取当前分支
    - 实现 `refresh(directory)` 函数：先执行 `git fetch`（使用 `.nothrow()`），再调用 `list` 返回更新后的分支列表
    - 实现 `filter(branches, query)` 函数：对分支名进行大小写不敏感的模糊匹配过滤，返回原列表的子集
    - 实现 `validate(name, directory)` 函数：通过 `git check-ref-format --branch` 校验分支名合法性
    - 实现 `exists(name, directory)` 函数：通过 `git show-ref` 检查分支名是否已存在
    - 遵循项目风格：使用 `Bun.$` 执行 git 命令，使用 `.nothrow()` + exitCode 检查，避免 try/catch
    - _需求: 2.1, 2.3, 2.4, 3.2, 5.3, 5.5_

  - [ ]* 1.2 编写 `Branch.filter` 的属性测试
    - **Property 3: 分支搜索过滤**
    - 使用 fast-check 生成随机分支名列表和搜索词，验证过滤结果是原列表的子集且仅包含匹配项
    - 测试文件：`packages/opencode/test/branch/branch.test.ts`
    - **验证需求: 3.2**

  - [ ]* 1.3 编写 `Branch.validate` 的属性测试
    - **Property 6: 分支名校验**
    - 使用 fast-check 生成随机字符串，验证 validate 函数的返回值与 git check-ref-format 结果一致
    - 测试文件：`packages/opencode/test/branch/branch.test.ts`
    - **验证需求: 5.5**

- [x] 2. 实现 Branch Server 路由
  - [x] 2.1 创建 `packages/opencode/src/server/routes/branch.ts`，实现 `BranchRoutes`
    - 实现 `GET /branch/list?directory={dir}` 端点，调用 `Branch.list` 返回 `{ local, remote, current }`
    - 实现 `POST /branch/refresh` 端点，接受 `{ directory }` 请求体，调用 `Branch.refresh` 返回更新后的分支列表
    - 使用 `describeRoute` + `validator` + `resolver` 模式，参考现有 `SessionRoutes` 的写法
    - 使用 `lazy()` 包装导出
    - _需求: 2.1, 2.2, 2.3_

  - [x] 2.2 在 `packages/opencode/src/server/server.ts` 中注册 `BranchRoutes`
    - 导入 `BranchRoutes` 并添加 `.route("/branch", BranchRoutes())`
    - _需求: 2.1_

- [x] 3. 修改 Session 模块以支持 baseBranch 参数
  - [x] 3.1 修改 `packages/opencode/src/session/index.ts` 中的 `createNext` 函数
    - 在 `createNext` 的 input 参数中新增可选的 `branches?: Record<string, string>`（projectID -> baseBranch 映射）
    - 将对应项目的 baseBranch 传递给 `createSessionRoot`
    - _需求: 1.4, 4.3_

  - [x] 3.2 修改 `packages/opencode/src/session/index.ts` 中的 `createSessionRoot` 函数
    - 在 input 参数中新增可选的 `baseBranch?: string`
    - 当 `baseBranch` 存在时，使用 `git rev-parse {baseBranch}` 获取 commit，而非使用 HEAD
    - 当 `baseBranch` 不存在时，保持现有行为（使用当前 HEAD 分支）
    - _需求: 1.4, 4.3, 4.4_

  - [x] 3.3 修改 `packages/opencode/src/session/index.ts` 中的 `Session.create` schema
    - 在 `create` 的 zod schema 中新增可选的 `branches: z.record(z.string(), z.string()).optional()`
    - 将 `branches` 传递给 `createNext`
    - _需求: 1.4_

- [x] 4. 修改 Session Server 路由
  - [x] 4.1 修改 `packages/opencode/src/server/routes/session.ts` 中的 session create 端点
    - 确保 `Session.create.schema` 的变更（新增 branches 字段）在路由中正确传递
    - _需求: 1.4_

- [x] 5. Checkpoint - 确保后端变更正确
  - 确保所有测试通过，如有问题请向用户确认。

- [ ] 6. 重新生成 SDK
  - [ ] 6.1 运行 `./packages/sdk/js/script/build.ts` 重新生成 JavaScript SDK
    - 确保新增的 `branches` 字段和 branch API 端点在 SDK 中可用
    - _需求: 1.4, 2.1_

- [ ] 7. 实现前端 DialogSelectBranch 组件
  - [ ] 7.1 创建 `packages/app/src/components/dialog-select-branch.tsx`
    - 参考 `DialogSelectProject` 和 `DialogFork` 的模式
    - 使用 `Dialog` + `List` 组件展示分支列表
    - 通过 SDK 调用 `GET /branch/list` 获取分支数据
    - 分支按 "本地" / "远程" 分类展示
    - 支持搜索过滤（利用 `List` 组件的 `filterKeys` 或自定义过滤）
    - 默认选中当前分支（`current` 字段）
    - 提供刷新按钮，调用 `POST /branch/refresh` 后更新列表
    - API 调用失败时保留上一次的分支列表数据
    - 接口：`{ directory: string, projectName: string, onSelect: (branch: string | null) => void }`
    - _需求: 1.1, 1.2, 2.1, 2.2, 2.4, 3.1, 3.2, 3.3_

- [ ] 8. 修改前端会话创建流程
  - [ ] 8.1 修改 `packages/app/src/pages/layout.tsx` 中的 `createSession` 函数
    - 在调用 `session.create` 之前，获取 workspace 的 projects 列表
    - 对每个 vcs="git" 的 project，弹出 `DialogSelectBranch` 对话框收集分支选择
    - 跳过非 git 类型的 project
    - 收集所有分支选择结果为 `Record<string, string>`（projectID -> baseBranch）
    - 将 `branches` 参数传入 `session.create({ branches })`
    - _需求: 1.1, 1.2, 1.3, 1.4_

- [ ] 9. 实现分支名冲突处理
  - [ ] 9.1 在 `DialogSelectBranch` 中添加分支名冲突处理逻辑
    - 当自动生成的分支名已存在时，展示提示信息
    - 提供文本输入框让用户手动输入替代分支名
    - 调用 SDK 校验用户输入的分支名是否合法（validate）和是否已存在（exists）
    - 校验失败时提示用户重新输入
    - _需求: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 10. Checkpoint - 确保前端集成正确
  - 确保所有测试通过，如有问题请向用户确认。

- [ ] 11. 属性测试与单元测试
  - [ ]* 11.1 编写 Git 项目过滤的属性测试
    - **Property 1: Git 项目过滤**
    - 使用 fast-check 生成随机 workspace projects（混合 vcs 类型），验证过滤逻辑仅选出 vcs="git" 的项目，且数量正确
    - 测试文件：`packages/opencode/test/branch/branch.test.ts`
    - **验证需求: 1.1, 1.3**

  - [ ]* 11.2 编写 Worktree 分支名格式的属性测试
    - **Property 4: Worktree 分支名格式**
    - 使用 fast-check 生成随机 sessionID 字符串，验证创建的 worktree 分支名严格等于 `session/{sessionID}`
    - 测试文件：`packages/opencode/test/branch/branch.test.ts`
    - **验证需求: 4.1**

  - [ ]* 11.3 编写 BaseBranch 记录一致性的单元测试
    - **Property 5: BaseBranch 记录一致性**
    - 验证传入 baseBranch 参数后 SessionRoot 的 baseBranch 和 baseCommit 字段正确性
    - 测试文件：`packages/opencode/test/session/session.test.ts`
    - **验证需求: 1.4, 4.3, 4.4**

  - [ ]* 11.4 编写默认分支选中的单元测试
    - **Property 2: 默认分支选中**
    - 验证 `Branch.list` 返回的 `current` 字段等于 git 仓库的当前分支
    - 测试文件：`packages/opencode/test/branch/branch.test.ts`
    - **验证需求: 1.2**

- [ ] 12. 最终 Checkpoint - 确保所有测试通过
  - 确保所有测试通过，如有问题请向用户确认。

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号以确保可追溯性
- Checkpoint 任务用于增量验证
- 属性测试验证通用正确性属性，单元测试验证具体示例和边界情况
- 需要先安装 `fast-check` 依赖：`bun add -d fast-check`（在 `packages/opencode` 目录下）
- 本功能仅涉及 Web 端，不需要修改 TUI 或 CLI 代码
