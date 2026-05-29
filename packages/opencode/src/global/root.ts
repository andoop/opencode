import fs from "fs/promises"
import { constants } from "fs"
import os from "os"
import path from "path"
import { xdgConfig } from "xdg-basedir"

const app = "opencode"
const version = 1
const marker = "opencode-portable-root"
const pointer = path.join(xdgConfig!, app, "portable-root.json")

type Source = "env" | "pointer" | "setup"
type State = {
  root: string
  source: Source
  configured: boolean
}

function normalize(input: string) {
  return path.resolve(input.trim())
}

function paths(root: string) {
  return {
    root,
    data: path.join(root, "data"),
    config: path.join(root, "config"),
    cache: path.join(root, "cache"),
    state: path.join(root, "state"),
    manifest: path.join(root, "manifest.json"),
  }
}

async function readPointer() {
  const content = await Bun.file(pointer)
    .json()
    .catch(() => undefined)
  if (typeof content?.root !== "string") return
  if (!path.isAbsolute(content.root)) return
  return content.root
}

const initial = await (async (): Promise<State> => {
  const env = process.env.OPENCODE_PORTABLE_ROOT?.trim()
  if (env) {
    return {
      root: normalize(env),
      source: "env",
      configured: true,
    }
  }

  const stored = await readPointer()
  if (stored) {
    return {
      root: stored,
      source: "pointer",
      configured: true,
    }
  }

  return {
    root: path.join(os.tmpdir(), `opencode-setup-${process.pid}`),
    source: "setup",
    configured: false,
  }
})()

let state = initial

export namespace DataRoot {
  export const Manifest = {
    version,
    marker,
  } as const

  export type Source = typeof state.source
  export type State = typeof state

  export type Validation = {
    ok: boolean
    root: string
    exists: boolean
    initialized: boolean
    reason?: string
  }

  async function exists(target: string) {
    return fs
      .stat(target)
      .then(() => true)
      .catch(() => false)
  }

  async function isDirectory(target: string) {
    return fs
      .stat(target)
      .then((stat) => stat.isDirectory())
      .catch(() => false)
  }

  async function initialized(root: string) {
    const layout = paths(root)
    const manifest = await Bun.file(layout.manifest)
      .json()
      .catch(() => undefined)
    return (
      manifest?.marker === marker &&
      manifest?.layout === version &&
      (await isDirectory(layout.data)) &&
      (await isDirectory(layout.config)) &&
      (await isDirectory(layout.cache)) &&
      (await isDirectory(layout.state))
    )
  }

  export function current() {
    return state
  }

  export function isConfigured() {
    return state.configured
  }

  export function pathFor() {
    return paths(state.root)
  }

  export function pointerFile() {
    return pointer
  }

  export async function validate(input: string): Promise<Validation> {
    const text = input.trim()
    if (!text) {
      return {
        ok: false,
        root: text,
        exists: false,
        initialized: false,
        reason: "Path is required",
      }
    }
    if (!path.isAbsolute(text)) {
      return {
        ok: false,
        root: text,
        exists: false,
        initialized: false,
        reason: "Path must be absolute",
      }
    }

    const root = normalize(text)
    const targetExists = await exists(root)
    if (targetExists && !(await isDirectory(root))) {
      return {
        ok: false,
        root,
        exists: true,
        initialized: false,
        reason: "Path exists but is not a directory",
      }
    }

    if (!targetExists) {
      const parent = path.dirname(root)
      if (!(await isDirectory(parent))) {
        return {
          ok: false,
          root,
          exists: false,
          initialized: false,
          reason: "Parent directory does not exist",
        }
      }
      const writable = await fs
        .access(parent, constants.W_OK)
        .then(() => true)
        .catch(() => false)
      if (!writable) {
        return {
          ok: false,
          root,
          exists: false,
          initialized: false,
          reason: "Parent directory is not writable",
        }
      }
      return {
        ok: true,
        root,
        exists: false,
        initialized: false,
      }
    }

    const readable = await fs
      .access(root, constants.R_OK | constants.W_OK)
      .then(() => true)
      .catch(() => false)
    if (!readable) {
      return {
        ok: false,
        root,
        exists: true,
        initialized: false,
        reason: "Directory is not readable and writable",
      }
    }

    const isInitialized = await initialized(root)
    if (isInitialized) {
      return {
        ok: true,
        root,
        exists: true,
        initialized: true,
      }
    }

    const entries = await fs.readdir(root)
    const allowed = new Set(["data", "config", "cache", "state", "manifest.json"])
    if (entries.some((entry) => !allowed.has(entry))) {
      return {
        ok: false,
        root,
        exists: true,
        initialized: false,
        reason: "Directory must be empty or already initialized as an opencode portable root",
      }
    }

    return {
      ok: true,
      root,
      exists: true,
      initialized: false,
    }
  }

  export async function initialize(input: string) {
    const result = await validate(input)
    if (!result.ok) throw new Error(result.reason ?? "Invalid portable root")

    const layout = paths(result.root)
    await Promise.all([
      fs.mkdir(layout.data, { recursive: true }),
      fs.mkdir(path.join(layout.data, "bin"), { recursive: true }),
      fs.mkdir(path.join(layout.data, "log"), { recursive: true }),
      fs.mkdir(layout.config, { recursive: true }),
      fs.mkdir(layout.cache, { recursive: true }),
      fs.mkdir(layout.state, { recursive: true }),
    ])
    await Bun.write(
      layout.manifest,
      JSON.stringify(
        {
          marker,
          layout: version,
          version: typeof OPENCODE_VERSION === "string" ? OPENCODE_VERSION : "local",
          created: Date.now(),
        },
        null,
        2,
      ),
    )
    return result.root
  }

  export async function ensure() {
    if (!state.configured) return
    await initialize(state.root)
  }

  export async function bind(input: string) {
    const root = await initialize(input)
    await fs.mkdir(path.dirname(pointer), { recursive: true })
    await Bun.write(pointer, JSON.stringify({ root, updated: Date.now() }, null, 2))
    state = {
      root,
      source: "pointer",
      configured: true,
    }
    return state
  }
}
