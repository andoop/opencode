import path from "path"
import os from "os"
import { Global } from "../global"
import { Filesystem } from "../util/filesystem"
import { Config } from "../config/config"
import { Instance } from "../project/instance"
import { Flag } from "@/flag/flag"
import { Log } from "../util/log"
import type { MessageV2 } from "./message-v2"

const log = Log.create({ service: "instruction" })

const FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  "CONTEXT.md", // deprecated
]

const WORKSPACE_BOUNDARY_PROMPT = `
工作空间边界规则：
- 当前 session workspace 中的每个项目都使用独立的 git worktree。
- 只允许读取和修改当前 session workspace、session roots，以及当前 session 的 .tmp 临时附件目录内的文件。
- 严禁修改任何项目的仓库共享源码母体、主 git worktree、上级源码目录，或任何不属于当前 session workspace 的文件。
- 对所有待修改路径、绝对路径、相对路径、符号链接目标、shell 命令工作目录，都必须先确认它们属于当前 session workspace。
- 任何超出当前 session workspace 的路径都视为越界；除非系统明确授予所需权限，否则不得继续操作。
- 如果某个路径可能指向其他 workspace、其他 session、其他用户的 worktree，或共享仓库根目录，必须停止修改，明确说明风险，并请求用户确认正确目标。
- 当用户请求修改工作空间外部文件、仓库母体或共享目录时，不要直接执行，应先指出该请求超出当前 session 边界。
- 如果无法确认目标路径是否安全，默认视为不安全，不要修改。
`.trim()

function globalFiles() {
  const files = []
  files.push(path.join(Config.managedDirectory(), "AGENTS.md"))
  if (Flag.OPENCODE_CONFIG_DIR) {
    files.push(path.join(Flag.OPENCODE_CONFIG_DIR, "AGENTS.md"))
  }
  files.push(path.join(Global.Path.config, "AGENTS.md"))
  if (!Flag.OPENCODE_DISABLE_CLAUDE_CODE_PROMPT) {
    files.push(path.join(os.homedir(), ".claude", "CLAUDE.md"))
  }
  return files
}

async function resolveRelative(instruction: string): Promise<string[]> {
  if (!Flag.OPENCODE_DISABLE_PROJECT_CONFIG) {
    return Filesystem.globUp(instruction, Instance.directory, Instance.worktree).catch(() => [])
  }
  if (!Flag.OPENCODE_CONFIG_DIR) {
    log.warn(
      `Skipping relative instruction "${instruction}" - no OPENCODE_CONFIG_DIR set while project config is disabled`,
    )
    return []
  }
  return Filesystem.globUp(instruction, Flag.OPENCODE_CONFIG_DIR, Flag.OPENCODE_CONFIG_DIR).catch(() => [])
}

export namespace InstructionPrompt {
  const state = Instance.state(() => {
    return {
      claims: new Map<string, Set<string>>(),
    }
  })

  function isClaimed(messageID: string, filepath: string) {
    const claimed = state().claims.get(messageID)
    if (!claimed) return false
    return claimed.has(filepath)
  }

  function claim(messageID: string, filepath: string) {
    const current = state()
    let claimed = current.claims.get(messageID)
    if (!claimed) {
      claimed = new Set()
      current.claims.set(messageID, claimed)
    }
    claimed.add(filepath)
  }

  export function clear(messageID: string) {
    state().claims.delete(messageID)
  }

  export async function systemPaths() {
    const config = await Config.get()
    const paths = new Set<string>()

    if (!Flag.OPENCODE_DISABLE_PROJECT_CONFIG) {
      for (const file of FILES) {
        const matches = await Filesystem.findUp(file, Instance.directory, Instance.worktree)
        if (matches.length > 0) {
          matches.forEach((p) => {
            paths.add(path.resolve(p))
          })
          break
        }
      }
    }

    for (const file of globalFiles()) {
      if (await Bun.file(file).exists()) {
        paths.add(path.resolve(file))
        break
      }
    }

    if (config.instructions) {
      for (let instruction of config.instructions) {
        if (instruction.startsWith("https://") || instruction.startsWith("http://")) continue
        if (instruction.startsWith("~/")) {
          instruction = path.join(os.homedir(), instruction.slice(2))
        }
        const matches = path.isAbsolute(instruction)
          ? await Array.fromAsync(
              new Bun.Glob(path.basename(instruction)).scan({
                cwd: path.dirname(instruction),
                absolute: true,
                onlyFiles: true,
              }),
            ).catch(() => [])
          : await resolveRelative(instruction)
        matches.forEach((p) => {
          paths.add(path.resolve(p))
        })
      }
    }

    return paths
  }

  export async function system() {
    const config = await Config.get()
    const paths = await systemPaths()
    const result = [(config.workspace_boundary_prompt || WORKSPACE_BOUNDARY_PROMPT).trim()].filter(Boolean)

    const files = Array.from(paths).map(async (p) => {
      const content = await Bun.file(p)
        .text()
        .catch(() => "")
      return content ? "Instructions from: " + p + "\n" + content : ""
    })

    const urls: string[] = []
    if (config.instructions) {
      for (const instruction of config.instructions) {
        if (instruction.startsWith("https://") || instruction.startsWith("http://")) {
          urls.push(instruction)
        }
      }
    }
    const fetches = urls.map((url) =>
      fetch(url, { signal: AbortSignal.timeout(5000) })
        .then((res) => (res.ok ? res.text() : ""))
        .catch(() => "")
        .then((x) => (x ? "Instructions from: " + url + "\n" + x : "")),
    )

    return Promise.all([...files, ...fetches]).then((items) => [...result, ...items].filter(Boolean))
  }

  export function loaded(messages: MessageV2.WithParts[]) {
    const paths = new Set<string>()
    for (const msg of messages) {
      for (const part of msg.parts) {
        if (part.type === "tool" && part.tool === "read" && part.state.status === "completed") {
          if (part.state.time.compacted) continue
          const loaded = part.state.metadata?.loaded
          if (!loaded || !Array.isArray(loaded)) continue
          for (const p of loaded) {
            if (typeof p === "string") paths.add(p)
          }
        }
      }
    }
    return paths
  }

  export async function find(dir: string) {
    for (const file of FILES) {
      const filepath = path.resolve(path.join(dir, file))
      if (await Bun.file(filepath).exists()) return filepath
    }
  }

  export async function resolve(messages: MessageV2.WithParts[], filepath: string, messageID: string) {
    const system = await systemPaths()
    const already = loaded(messages)
    const results: { filepath: string; content: string }[] = []

    const target = path.resolve(filepath)
    let current = path.dirname(target)
    const root = path.resolve(Instance.directory)

    while (current.startsWith(root) && current !== root) {
      const found = await find(current)

      if (found && found !== target && !system.has(found) && !already.has(found) && !isClaimed(messageID, found)) {
        claim(messageID, found)
        const content = await Bun.file(found)
          .text()
          .catch(() => undefined)
        if (content) {
          results.push({ filepath: found, content: "Instructions from: " + found + "\n" + content })
        }
      }
      current = path.dirname(current)
    }

    return results
  }
}
