import { Filesystem } from "../util/filesystem"
import path from "path"
import { $ } from "bun"
import { Flag } from "@/flag/flag"
import z from "zod"
import { Log } from "@/util/log"

const Vcs = z.literal("git").optional()
const log = Log.create({ service: "project.resolve" })

export async function resolveDirectory(directory: string) {
  using resolveTimer = log.time("resolveDirectory", { directory })
  const matches = Filesystem.up({ targets: [".git"], start: directory })
  const git = await matches.next().then((x) => x.value)
  await matches.return()
  if (!git) {
    log.info("resolveDirectory.global", { directory })
    return {
      id: "global",
      worktree: "/",
      sandbox: "/",
      vcs: Vcs.parse(Flag.OPENCODE_FAKE_VCS),
    }
  }

  let sandbox = path.dirname(git)
  const gitBinary = Bun.which("git")
  let id = await Bun.file(path.join(git, "opencode"))
    .text()
    .then((x) => x.trim())
    .catch(() => undefined)

  if (!gitBinary) {
    return {
      id: id ?? "global",
      worktree: sandbox,
      sandbox,
      vcs: Vcs.parse(Flag.OPENCODE_FAKE_VCS),
    }
  }

  if (!id) {
    using rootsTimer = log.time("resolveDirectory.roots", { sandbox })
    const roots = await $`git rev-list --max-parents=0 --all`
      .quiet()
      .nothrow()
      .cwd(sandbox)
      .text()
      .then((x) =>
        x
          .split("\n")
          .filter(Boolean)
          .map((x) => x.trim())
          .toSorted(),
      )
      .catch(() => undefined)

    if (!roots) {
      return {
        id: "global",
        worktree: sandbox,
        sandbox,
        vcs: Vcs.parse(Flag.OPENCODE_FAKE_VCS),
      }
    }

    id = roots[0]
    if (id) {
      void Bun.file(path.join(git, "opencode"))
        .write(id)
        .catch(() => undefined)
    }
  }

  if (!id) {
    return {
      id: "global",
      worktree: sandbox,
      sandbox,
      vcs: "git" as const,
    }
  }

  using topTimer = log.time("resolveDirectory.top", { sandbox })
  const top = await $`git rev-parse --show-toplevel`
    .quiet()
    .nothrow()
    .cwd(sandbox)
    .text()
    .then((x) => path.resolve(sandbox, x.trim()))
    .catch(() => undefined)

  if (!top) {
    return {
      id,
      sandbox,
      worktree: sandbox,
      vcs: Vcs.parse(Flag.OPENCODE_FAKE_VCS),
    }
  }

  sandbox = top

  using worktreeTimer = log.time("resolveDirectory.worktree", { sandbox })
  const worktree = await $`git rev-parse --git-common-dir`
    .quiet()
    .nothrow()
    .cwd(sandbox)
    .text()
    .then((x) => {
      const dirname = path.dirname(x.trim())
      if (dirname === ".") return sandbox
      return dirname
    })
    .catch(() => undefined)

  if (!worktree) {
    return {
      id,
      sandbox,
      worktree: sandbox,
      vcs: Vcs.parse(Flag.OPENCODE_FAKE_VCS),
    }
  }

  log.info("resolveDirectory.git", {
    directory,
    sandbox,
    worktree,
    id,
  })
  return {
    id,
    sandbox,
    worktree,
    vcs: "git" as const,
  }
}
