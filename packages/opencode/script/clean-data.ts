#!/usr/bin/env bun
/**
 * Clean opencode runtime data (sessions, logs, cache, etc.)
 *
 * Usage:
 *   bun run script/clean-data.ts           # Clean runtime data, keep auth & config
 *   bun run script/clean-data.ts --all     # Full reset, remove auth & config too
 */

import fs from "fs/promises"
import path from "path"
import os from "os"
import { xdgData, xdgCache, xdgConfig, xdgState } from "xdg-basedir"

const app = "opencode"
const home = process.env.OPENCODE_TEST_HOME || os.homedir()
const data = path.join(xdgData ?? path.join(home, ".local", "share"), app)
const cache = path.join(xdgCache ?? path.join(home, ".cache"), app)
const config = path.join(xdgConfig ?? path.join(home, ".config"), app)
const state = path.join(xdgState ?? path.join(home, ".local", "state"), app)

const dirs = [
  { p: path.join(data, "storage"), label: "storage" },
  { p: path.join(data, "workspace"), label: "workspace" },
  { p: path.join(data, "worktree"), label: "worktree" },
  { p: path.join(data, "user-worktree"), label: "user-worktree" },
  { p: path.join(data, "log"), label: "log" },
  { p: path.join(data, "plans"), label: "plans" },
  { p: path.join(data, "snapshot"), label: "snapshot" },
  { p: path.join(data, "tool-output"), label: "tool-output" },
  { p: cache, label: "cache" },
  { p: state, label: "state" },
]

const files = [
  { p: path.join(data, "auth.json"), label: "auth.json" },
  { p: path.join(data, "mcp-auth.json"), label: "mcp-auth.json" },
]

async function remove(target: string, recursive: boolean): Promise<boolean> {
  try {
    await fs.access(target)
    await fs.rm(target, { recursive, force: true })
    return true
  } catch {
    return false
  }
}

async function main() {
  const all = process.argv.includes("--all")
  console.log("Cleaning opencode data...")
  console.log("")

  let removed = 0
  for (const { p, label } of dirs) {
    if (await remove(p, true)) {
      console.log(`  removed ${label}`)
      removed++
    }
  }

  for (const { p, label } of files) {
    if (all && (await remove(p, false))) {
      console.log(`  removed ${label}`)
      removed++
    }
  }

  if (all) {
    const configRemoved = await remove(config, true)
    if (configRemoved) {
      console.log("  removed config")
      removed++
    }
  }

  if (removed === 0) {
    console.log("  (nothing to remove)")
  }

  console.log("")
  console.log("Done.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
