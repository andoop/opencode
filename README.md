<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">Customized internal AI R&D collaboration web platform based on OpenCode.</p>
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

## Project Positioning

This repository does not describe a generic desktop AI coding tool. It describes an internal web-based AI R&D platform customized from OpenCode.

- This is a **Web-first** internal product; the current customization focus is the Web App
- It serves **multi-user collaboration** within the organization, not single-developer local usage
- It does not let users freely connect to arbitrary server directories; users work within **admin-controlled project boundaries**
- It provides **unified AI platform capabilities**, not just a "chat with AI to edit code" page

Think of it as:

> A controlled, governable, multi-user AI R&D workbench for internal use.

## Our Philosophy

The platform aims to become a unified internal AI R&D collaboration platform, not just an AI coding page.

Core principles:

- **Not a remote desktop, but an AI workbench within controlled projects**
- **Not for a few developers to monopolize AI, but for more roles to participate in software production within authorized scope**
- **Not AI that only answers questions, but AI that gradually becomes the execution layer in the R&D workflow**
- **Not unbounded access, but efficiency gains under governance of permissions, projects, sessions, and models**

In product terms, the three most important boundaries are:

- **Project boundary**: Regular users can only access projects pre-registered by admins
- **Session boundary**: One task maps to one independent session and workspace
- **Permission boundary**: What users see, what they can do, and which models they can use are all controlled by the platform

## Current Key Capabilities

The customization focuses on the Web App:

- Multi-user registration, login, and account management
- Admin-facing user, project, model, and audit capabilities
- Project registration so only approved code repositories are exposed
- Session-level isolated workspaces, typically via Git worktrees
- Unified governance of models, providers, permissions, and modes
- A unified AI platform entry point for teams

The platform’s focus is not desktop or TUI, but:

> Enabling internal users to complete Q&A, analysis, editing, execution, and collaboration via the web, within controlled projects.

## Multi-User and Unified AI Platform

The platform does not grant full access to everyone who logs in. Instead:

1. Admins prepare project code on the server
2. Admins register allowed directories as projects
3. Users register and log in via the web
4. Regular users only see projects that have been opened to them
5. Users start work in sessions after entering a project

The unified AI platform provides:

- Unified model entry point
- Unified provider management
- Unified permission control
- Unified session workflow
- Unified audit and governance boundaries

This design supports gradual internal rollout: start with low-risk permissions, then expand by role and scenario.

## Cursor CLI Support

The platform supports **Cursor CLI** as a model/provider source in the unified AI platform.

### How to Connect

The server machine must have Cursor CLI installed and the `agent` command available in the shell:

```bash
agent login
```

After login, the platform reuses the local Cursor login state.

### Usage in the Platform

- Admins control whether users can access model and provider settings
- Default restricted users typically only have `ask` mode
- Default model whitelist usually includes:
  - `cursor-cli/auto`
  - `cursor-cli/composer-2`
  - `cursor-cli/composer-2-fast`
  - `cursor-cli/composer-2.5`
  - `cursor-cli/composer-2.5-fast`

If Cursor CLI is not installed or `agent` is not available, Cursor CLI models and providers will not appear in the platform.

### Configuration Recommendations

For initial internal rollout:

- Default restricted users: only `ask` mode
- Default model whitelist: prefer `cursor-cli` models
- Do not expose Provider, Server, MCP, or other high-risk management by default
- Let admins expand capabilities per user or role as needed

Benefits:

- Low onboarding cost
- Clear risk boundaries
- Unified model source
- Simple UX for internal adoption

### Role in the System

With Cursor CLI connected, the platform does not simply call an external model API. It assembles session context, project boundaries, and platform tools, then hands them to Cursor CLI for execution.

So `cursor-cli` is not a standalone tool here, but part of the unified AI platform.

## Admin Rollout Recommendations

Recommended approach:

1. Prepare controlled project directories
2. Register only explicitly approved repositories
3. Give regular users restricted permissions by default
4. Prioritize web Q&A and low-risk capabilities
5. Gradually add more models, modes, and workflow features

In short: do not enable everything at once. Instead:

> Establish project, permission, model, and session boundaries first, then expand platform capabilities step by step.

## Local Development

The customization focuses on the Web App, so local development should start the web stack.

Install dependencies:

```bash
bun install
```

One-command startup:

```bash
sh restart-services.sh
```

Default URLs:

- Backend: `http://localhost:4096`
- Frontend: `http://localhost:3000`

To start separately:

```bash
bun run --cwd packages/opencode dev
bun run --cwd packages/app dev
```

## Related Documentation

- `docs/internal-web-user-manual.md`
  - User guide for admins and regular users
- `docs/internal-ai-platform-vision.md`
  - Product vision and future direction for the team

These documents are more detailed and closer to the actual goals of this customized product.

---

**Current focus**: Web App, multi-user, unified AI platform, controlled project collaboration.
