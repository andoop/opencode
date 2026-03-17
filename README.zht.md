<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">基於 OpenCode 定製的公司內部 AI 研發協作 Web 平台。</p>
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

## 專案定位

這個倉庫不是在介紹一個通用的桌面 AI Coding 工具，而是在介紹一套基於 OpenCode 定製開發的公司內部 Web AI 研發平台。

- 這是一個 **Web-first** 的內部產品，當前定製重點就是 Web App
- 它服務的不是單個開發者本地使用場景，而是公司內部的 **多使用者協作**
- 它關注的不是「讓大家隨便連接伺服器目錄」，而是讓使用者在 **管理員預先控制的專案邊界內** 使用 AI
- 它提供的是 **統一 AI 平台能力**，而不只是一個「和 AI 聊天改程式碼」的頁面

可以把它理解為：

> 一套公司內部受控、可治理、面向多人協作的 AI 研發工作台。

## 我們的理念

這套平台想做的，不只是一個 AI 寫程式碼頁面，而是逐步建設成公司內部統一的 AI 研發協作平台。

我們的核心理念是：

- **不是遠端桌面，而是受控專案內的 AI 工作台**
- **不是讓少數開發者獨享 AI，而是讓更多角色在授權範圍內參與軟體生產**
- **不是讓 AI 只回答問題，而是讓 AI 逐步成為研發流程中的執行層**
- **不是放開邊界，而是在權限、專案、會話、模型等治理前提下提升效率**

對應到產品設計上，當前最重要的三個邊界是：

- **專案邊界**：普通使用者只能進入管理員預先登記的專案
- **會話邊界**：一個任務對應一個獨立會話和獨立工作區
- **權限邊界**：不同使用者看到什麼、能做什麼、能用哪些模型，都由平台控制

## 當前重點能力

當前這套定製版重點能力主要集中在 Web App：

- 多使用者註冊、登入與帳號管理
- 管理員可見的使用者、專案、模型與審計能力
- 專案註冊機制，只開放允許使用的程式碼倉庫
- 會話級獨立工作區，盡量基於 Git worktree 做任務隔離
- 模型、Provider、權限、模式的統一治理
- 面向團隊的統一 AI 平台入口

這意味著平台當前的重點，不是桌面端，也不是 TUI，而是：

> 讓公司內部使用者透過 Web 頁面，在受控專案中完成問答、分析、修改、執行和協作。

## 多使用者與統一 AI 平台

在當前設計裡，平台不是「誰登入進來就能隨便用所有能力」，而是：

1. 管理員先在服務端機器上準備專案程式碼
2. 管理員把允許存取的目錄註冊為專案
3. 使用者透過 Web 頁面註冊、登入
4. 普通使用者只能看到被開放的專案
5. 使用者進入專案後，再基於會話開始具體工作

統一 AI 平台主要體現在：

- 統一模型入口
- 統一 Provider 管理
- 統一權限控制
- 統一會話工作方式
- 統一審計與治理邊界

這套設計適合公司內部逐步推廣：先在低風險權限下開放，再按角色和場景逐步增加能力。

## Cursor CLI 支援

這套平台支援把 **Cursor CLI** 作為統一 AI 平台中的一個模型/Provider 接入來源。

### 接入方式

服務所在機器需要先安裝 Cursor CLI，並確保 `agent` 指令在 shell 中可用：

```bash
agent login
```

登入完成後，平台就可以複用本機已有的 Cursor 登入狀態。

### 在平台中的使用方式

- 管理員可以在使用者權限裡控制是否開放模型入口、Provider 入口
- 預設受限註冊使用者通常只開放 `ask` 模式
- 當前預設白名單模型通常包括：
  - `cursor-cli/auto`
  - `cursor-cli/composer-1`
  - `cursor-cli/composer-1.5`

如果服務機器沒有正確安裝 Cursor CLI，或 `agent` 指令不可用，那麼平台裡不會出現 `Cursor CLI` 相關模型或 Provider。

### 配置建議

對於公司內部初期落地，推薦這樣配置：

- 普通註冊使用者預設只開放 `ask`
- 預設模型白名單優先使用 `cursor-cli` 系列
- 不預設開放 Provider、Server、MCP 等高風險管理入口
- 由管理員按人、按角色逐步擴展能力

這樣做的好處是：

- 接入成本低
- 風險邊界清晰
- 模型來源統一
- 使用者體驗簡單，便於內部推廣

### 它在系統裡的意義

接入 Cursor CLI 後，平台並不是簡單呼叫一個外部模型介面，而是把當前會話上下文、專案邊界和平台工具能力統一組織起來，再轉給 Cursor CLI 參與執行。

這使得 `cursor-cli` 在這裡不是一個孤立工具，而是統一 AI 平台中的一部分。

## 管理員推薦落地方式

建議按以下方式使用這套系統：

1. 先準備受控的專案目錄
2. 只註冊明確允許開放的倉庫
3. 預設給普通使用者受限權限
4. 優先開放 Web 端問答和低風險能力
5. 再逐步引入更多模型、更多模式和更多流程能力

一句話說，推薦的不是「先把所有能力都打開」，而是：

> 先把專案邊界、權限邊界、模型邊界和會話邊界建好，再逐步放大平台能力。

## 本地開發

當前倉庫的定製重點是 Web App，因此本地開發也建議優先按 Web 方式啟動。

安裝依賴：

```bash
bun install
```

一鍵啟動本地服務：

```bash
sh restart-services.sh
```

預設位址：

- 後端：`http://localhost:4096`
- 前端：`http://localhost:3000`

如果要分別啟動：

```bash
bun run --cwd packages/opencode dev
bun run --cwd packages/app dev
```

## 相關文件

- `docs/internal-web-user-manual.md`
  - 面向管理員和普通使用者的使用說明
- `docs/internal-ai-platform-vision.md`
  - 面向團隊內部的產品理念與未來方向

這兩個文件比當前 README 更詳細，也更接近這套定製版產品本身的真實目標。

---

**當前版本重點**：Web App、多使用者、統一 AI 平台、受控專案協作。
