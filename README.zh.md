<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">基于 OpenCode 定制的公司内部 AI 研发协作 Web 平台。</p>
<p align="center">
  <a href="https://opencode.ai/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/opencode-ai"><img alt="npm" src="https://img.shields.io/npm/v/opencode-ai?style=flat-square" /></a>
  <a href="https://github.com/anomalyco/opencode/actions/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/anomalyco/opencode/publish.yml?style=flat-square&branch=dev" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a>
</p>

[![OpenCode Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://opencode.ai)

---

## 项目定位

这个仓库不是在介绍一个通用的桌面 AI Coding 工具，而是在介绍一套基于 OpenCode 定制开发的公司内部 Web AI 研发平台。

- 这是一个 **Web-first** 的内部产品，当前定制重点就是 Web App
- 它服务的不是单个开发者本地使用场景，而是公司内部的 **多用户协作**
- 它关注的不是“让大家随便连接服务器目录”，而是让用户在 **管理员预先控制的项目边界内** 使用 AI
- 它提供的是 **统一 AI 平台能力**，而不只是一个“和 AI 聊天改代码”的页面

可以把它理解为：

> 一套公司内部受控、可治理、面向多人协作的 AI 研发工作台。

## 我们的理念

这套平台想做的，不只是一个 AI 写代码页面，而是逐步建设成公司内部统一的 AI 研发协作平台。

我们的核心理念是：

- **不是远程桌面，而是受控项目内的 AI 工作台**
- **不是让少数开发者独享 AI，而是让更多角色在授权范围内参与软件生产**
- **不是让 AI 只回答问题，而是让 AI 逐步成为研发流程中的执行层**
- **不是放开边界，而是在权限、项目、会话、模型等治理前提下提升效率**

对应到产品设计上，当前最重要的三个边界是：

- **项目边界**：普通用户只能进入管理员预先登记的项目
- **会话边界**：一个任务对应一个独立会话和独立工作区
- **权限边界**：不同用户看到什么、能做什么、能用哪些模型，都由平台控制

## 当前重点能力

当前这套定制版重点能力主要集中在 Web App：

- 多用户注册、登录与账号管理
- 管理员可见的用户、项目、模型与审计能力
- 项目注册机制，只开放允许使用的代码仓库
- 会话级独立工作区，尽量基于 Git worktree 做任务隔离
- 模型、Provider、权限、模式的统一治理
- 面向团队的统一 AI 平台入口

这意味着平台当前的重点，不是桌面端，也不是 TUI，而是：

> 让公司内部用户通过 Web 页面，在受控项目中完成问答、分析、修改、执行和协作。

## 多用户与统一 AI 平台

在当前设计里，平台不是“谁登录进来就能随便用所有能力”，而是：

1. 管理员先在服务端机器上准备项目代码。
2. 管理员把允许访问的目录注册为项目。
3. 用户通过 Web 页面注册、登录。
4. 普通用户只能看到被开放的项目。
5. 用户进入项目后，再基于会话开始具体工作。

统一 AI 平台主要体现在：

- 统一模型入口
- 统一 Provider 管理
- 统一权限控制
- 统一会话工作方式
- 统一审计与治理边界

这套设计适合公司内部逐步推广：先在低风险权限下开放，再按角色和场景逐步增加能力。

## Cursor CLI 支持

这套平台支持把 **Cursor CLI** 作为统一 AI 平台中的一个模型/Provider 接入来源。

### 接入方式

服务所在机器需要先安装 Cursor CLI，并确保 `agent` 命令在 shell 中可用：

```bash
agent login
```

登录完成后，平台就可以复用本机已有的 Cursor 登录状态。

### 在平台中的使用方式

- 管理员可以在用户权限里控制是否开放模型入口、Provider 入口
- 默认受限注册用户通常只开放 `ask` 模式
- 当前默认白名单模型通常包括：
  - `cursor-cli/auto`
  - `cursor-cli/composer-1`
  - `cursor-cli/composer-1.5`

如果服务机器没有正确安装 Cursor CLI，或者 `agent` 命令不可用，那么平台里不会出现 `Cursor CLI` 相关模型或 Provider。

### 配置建议

对于公司内部初期落地，推荐这样配置：

- 普通注册用户默认只开放 `ask`
- 默认模型白名单优先使用 `cursor-cli` 系列
- 不默认开放 Provider、Server、MCP 等高风险管理入口
- 由管理员按人、按角色逐步扩展能力

这样做的好处是：

- 接入成本低
- 风险边界清晰
- 模型来源统一
- 用户体验简单，便于内部推广

### 它在系统里的意义

接入 Cursor CLI 后，平台并不是简单调用一个外部模型接口，而是把当前会话上下文、项目边界和平台工具能力统一组织起来，再转给 Cursor CLI 参与执行。

这使得 `cursor-cli` 在这里不是一个孤立工具，而是统一 AI 平台中的一部分。

## 管理员推荐落地方式

建议按以下方式使用这套系统：

1. 先准备受控的项目目录。
2. 只注册明确允许开放的仓库。
3. 默认给普通用户受限权限。
4. 优先开放 Web 端问答和低风险能力。
5. 再逐步引入更多模型、更多模式和更多流程能力。

一句话说，推荐的不是“先把所有能力都打开”，而是：

> 先把项目边界、权限边界、模型边界和会话边界建好，再逐步放大平台能力。

## 本地开发

当前仓库的定制重点是 Web App，因此本地开发也建议优先按 Web 方式启动。

安装依赖：

```bash
bun install
```

一键启动本地服务：

```bash
sh restart-services.sh
```

默认地址：

- 后端：`http://localhost:4096`
- 前端：`http://localhost:3000`

如果要分别启动：

```bash
bun run --cwd packages/opencode dev
bun run --cwd packages/app dev
```

## 相关文档

- `docs/internal-web-user-manual.md`
  - 面向管理员和普通用户的使用说明
- `docs/internal-ai-platform-vision.md`
  - 面向团队内部的产品理念与未来方向

这两个文档比当前 README 更详细，也更接近这套定制版产品本身的真实目标。

---

**当前版本重点**：Web App、多用户、统一 AI 平台、受控项目协作。
