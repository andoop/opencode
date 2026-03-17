# `@opencode-ai/opencode`

Customized OpenCode server package for the RealseeCode web application.

This package is based on the upstream OpenCode project, but the primary product focus in this repository is the web app rather than the desktop app or terminal UI.

## Product Focus

- Multi-user access with account, permission, and workspace isolation
- Unified AI platform for centrally managed providers and model access
- Web-first experience for team usage and daily operations

## Local Development

Install dependencies from the repository root:

```bash
bun install
```

Run the OpenCode server package:

```bash
bun run --cwd packages/opencode dev
```

Run the web app separately:

```bash
bun run --cwd packages/app dev
```

## Notes

- This repository contains custom development built on top of OpenCode.
- The main customized surface is the web application and its multi-user workflow.
- Server runtime data can be cleaned with `bun run --cwd packages/opencode clean-data`.
