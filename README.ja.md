<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">OpenCode をベースにした社内 AI R&D 協働 Web プラットフォーム。</p>
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

## プロジェクトの位置づけ

このリポジトリは汎用のデスクトップ AI コーディングツールではなく、OpenCode をベースにカスタマイズした社内 Web AI R&D プラットフォームを紹介しています。

- **Web-first** の社内プロダクトであり、現在のカスタマイズの中心は Web App です
- 単一開発者のローカル利用ではなく、社内の **マルチユーザー協働** を対象としています
- ユーザーがサーバーディレクトリに自由に接続するのではなく、**管理者が事前に制御するプロジェクト境界内** で AI を利用します
- 「AI とチャットしてコードを編集する」ページではなく、**統合 AI プラットフォームの機能** を提供します

次のように理解できます：

> 社内で制御可能で、ガバナンス可能な、複数人協働向けの AI R&D ワークベンチ。

## 私たちの理念

このプラットフォームは、単なる AI コーディングページではなく、段階的に社内統合 AI R&D 協働プラットフォームへと発展させることを目指しています。

核となる理念：

- **リモートデスクトップではなく、制御されたプロジェクト内の AI ワークベンチ**
- **少数の開発者が AI を独占するのではなく、より多くの役割が権限範囲内でソフトウェア生産に参加**
- **AI が質問に答えるだけではなく、AI が段階的に R&D ワークフローの実行層となる**
- **境界を解放するのではなく、権限・プロジェクト・セッション・モデルなどのガバナンスの下で効率を向上**

製品設計において、現在最も重要な 3 つの境界：

- **プロジェクト境界**：一般ユーザーは管理者が事前登録したプロジェクトのみアクセス可能
- **セッション境界**：1 タスクは 1 つの独立セッションと独立ワークスペースに対応
- **権限境界**：ユーザーが何を見て、何ができ、どのモデルを使えるかはすべてプラットフォームが制御

## 現在の重点機能

現在のカスタム版の重点機能は Web App に集中しています：

- マルチユーザー登録、ログイン、アカウント管理
- 管理者向けのユーザー、プロジェクト、モデル、監査機能
- プロジェクト登録により、許可されたコードリポジトリのみ公開
- セッション単位の独立ワークスペース、Git worktree によるタスク分離
- モデル、Provider、権限、モードの統合ガバナンス
- チーム向けの統合 AI プラットフォームの入口

つまり、プラットフォームの現在の重点はデスクトップや TUI ではなく：

> 社内ユーザーが Web ページを通じて、制御されたプロジェクト内で Q&A、分析、編集、実行、協働を完了すること。

## マルチユーザーと統合 AI プラットフォーム

現在の設計では、プラットフォームは「ログインした人がすべての機能を自由に使える」構造ではありません：

1. 管理者がまずサーバーマシンでプロジェクトコードを準備します
2. 管理者がアクセスを許可したディレクトリをプロジェクトとして登録します
3. ユーザーが Web ページで登録・ログインします
4. 一般ユーザーは公開されたプロジェクトのみ閲覧できます
5. ユーザーがプロジェクトに入った後、セッションに基づいて実際の作業を開始します

統合 AI プラットフォームは以下で実現されています：

- 統合モデル入口
- 統合 Provider 管理
- 統合権限制御
- 統合セッション作業方式
- 統合監査とガバナンス境界

この設計は社内の段階的導入に適しています：まず低リスク権限で公開し、役割とシナリオに応じて段階的に機能を拡大します。

## Cursor CLI サポート

このプラットフォームは **Cursor CLI** を統合 AI プラットフォームのモデル/Provider ソースとして接続できます。

### 接続方法

サーバーマシンに Cursor CLI をインストールし、シェルで `agent` コマンドが利用可能である必要があります：

```bash
agent login
```

ログイン後、プラットフォームはそのマシンの既存の Cursor ログイン状態を再利用します。

### プラットフォーム内での利用方法

- 管理者はユーザー権限でモデル入口、Provider 入口の公開可否を制御できます
- デフォルトの制限ユーザーは通常 `ask` モードのみ公開されます
- 現在のデフォルトホワイトリストモデルには通常以下が含まれます：
  - `cursor-cli/auto`
  - `cursor-cli/composer-1`
  - `cursor-cli/composer-1.5`

Cursor CLI が正しくインストールされていない、または `agent` コマンドが利用できない場合、プラットフォームに Cursor CLI 関連のモデルや Provider は表示されません。

### 設定推奨事項

社内初期導入では次の設定を推奨します：

- 一般登録ユーザーデフォルト：`ask` のみ公開
- デフォルトモデルホワイトリスト：`cursor-cli` シリーズを優先
- Provider、Server、MCP などの高リスク管理入口はデフォルトで公開しない
- 管理者がユーザー・役割ごとに段階的に機能を拡大

メリット：

- 導入コストが低い
- リスク境界が明確
- モデルソースが統一
- UX がシンプルで社内普及が容易

### システム内での役割

Cursor CLI を接続すると、プラットフォームは単純に外部モデル API を呼び出すのではなく、現在のセッションコンテキスト、プロジェクト境界、プラットフォームツール機能を統合し、Cursor CLI に渡して実行に参加させます。

したがって `cursor-cli` はここでは孤立したツールではなく、統合 AI プラットフォームの一部です。

## 管理者推奨導入方法

次のように使用することを推奨します：

1. まず制御されたプロジェクトディレクトリを準備します
2. 明示的に許可されたリポジトリのみ登録します
3. 一般ユーザーにはデフォルトで制限された権限を付与します
4. Web Q&A と低リスク機能を優先的に公開します
5. その後、より多くのモデル、モード、ワークフロー機能を段階的に導入します

一言で言うと、「まずすべての機能を開く」のではなく：

> プロジェクト境界、権限境界、モデル境界、セッション境界をまず構築し、その後段階的にプラットフォーム機能を拡大することを推奨します。

## ローカル開発

現在のリポジトリのカスタマイズ重点は Web App であるため、ローカル開発も Web 方式で優先的に起動することを推奨します。

依存関係のインストール：

```bash
bun install
```

ワンクリックでローカルサービスを起動：

```bash
sh restart-services.sh
```

デフォルトアドレス：

- バックエンド：`http://localhost:4096`
- フロントエンド：`http://localhost:3000`

個別に起動する場合：

```bash
bun run --cwd packages/opencode dev
bun run --cwd packages/app dev
```

## 関連ドキュメント

- `docs/internal-web-user-manual.md`
  - 管理者と一般ユーザー向けの使用説明
- `docs/internal-ai-platform-vision.md`
  - チーム向けのプロダクト理念と今後の方向性

これらのドキュメントは現在の README よりも詳細で、このカスタム版プロダクトの実際の目標に近い内容です。

---

**現在のバージョン重点**：Web App、マルチユーザー、統合 AI プラットフォーム、制御されたプロジェクト協働。
