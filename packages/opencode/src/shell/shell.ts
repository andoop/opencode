import { Flag } from "@/flag/flag"
import { lazy } from "@/util/lazy"
import { existsSync } from "fs"
import path from "path"
import { spawn, type ChildProcess } from "child_process"

const SIGKILL_TIMEOUT_MS = 200

export namespace Shell {
  export async function killTree(proc: ChildProcess, opts?: { exited?: () => boolean }): Promise<void> {
    const pid = proc.pid
    if (!pid || opts?.exited?.()) return

    if (process.platform === "win32") {
      await new Promise<void>((resolve) => {
        const killer = spawn("taskkill", ["/pid", String(pid), "/f", "/t"], { stdio: "ignore" })
        killer.once("exit", () => resolve())
        killer.once("error", () => resolve())
      })
      return
    }

    try {
      process.kill(-pid, "SIGTERM")
      await Bun.sleep(SIGKILL_TIMEOUT_MS)
      if (!opts?.exited?.()) {
        process.kill(-pid, "SIGKILL")
      }
    } catch (_e) {
      proc.kill("SIGTERM")
      await Bun.sleep(SIGKILL_TIMEOUT_MS)
      if (!opts?.exited?.()) {
        proc.kill("SIGKILL")
      }
    }
  }
  const BLACKLIST = new Set(["fish", "nu"])

  function available(shell: string) {
    if (!shell) return false
    if (path.isAbsolute(shell)) return existsSync(shell)
    return !!Bun.which(shell)
  }

  function candidate(shell: string | null | undefined, opts?: { blacklist?: boolean }) {
    if (!shell) return
    const name = process.platform === "win32" ? path.win32.basename(shell) : path.basename(shell)
    if (opts?.blacklist && BLACKLIST.has(name)) return
    if (!available(shell)) return
    return shell
  }

  function fallback() {
    if (process.platform === "win32") {
      const configured = candidate(Flag.OPENCODE_GIT_BASH_PATH)
      if (configured) return configured
      const git = Bun.which("git")
      if (git) {
        // git.exe is typically at: C:\Program Files\Git\cmd\git.exe
        // bash.exe is at: C:\Program Files\Git\bin\bash.exe
        const bash = path.join(git, "..", "..", "bin", "bash.exe")
        const resolved = candidate(bash)
        if (resolved) return resolved
      }
      return candidate(process.env.COMSPEC) || "cmd.exe"
    }
    if (process.platform === "darwin") {
      return candidate(process.env.SHELL) || candidate(Bun.which("zsh")) || candidate(Bun.which("bash")) || "/bin/sh"
    }
    const bash = candidate(Bun.which("bash"))
    if (bash) return bash
    return "/bin/sh"
  }

  export const preferred = lazy(() => {
    const shell = candidate(process.env.SHELL)
    if (shell) return shell
    return fallback()
  })

  export const acceptable = lazy(() => {
    const shell = candidate(process.env.SHELL, { blacklist: true })
    if (shell) return shell
    return fallback()
  })
}
