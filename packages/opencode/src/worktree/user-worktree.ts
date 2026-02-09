import { $ } from "bun"
import fs from "fs/promises"
import path from "path"
import z from "zod"
import { NamedError } from "@opencode-ai/util/error"
import { Global } from "../global"
import { Instance } from "../project/instance"
import { Project } from "../project/project"
import { User } from "../user"
import { Flag } from "../flag/flag"
import { Log } from "../util/log"

export namespace UserWorktree {
  const log = Log.create({ service: "user-worktree" })

  export const NotGitError = NamedError.create(
    "UserWorktreeNotGitError",
    z.object({ message: z.string() }),
  )

  export const CreateFailedError = NamedError.create(
    "UserWorktreeCreateFailedError",
    z.object({ message: z.string() }),
  )

  function isMultiUserMode(): boolean {
    return Flag.OPENCODE_MULTI_USER === "true" || Flag.OPENCODE_MULTI_USER === "1"
  }

  function outputText(input: Uint8Array | undefined): string {
    if (!input?.length) return ""
    return new TextDecoder().decode(input).trim()
  }

  function errorText(result: { stdout?: Uint8Array; stderr?: Uint8Array }): string {
    return [outputText(result.stderr), outputText(result.stdout)].filter(Boolean).join("\n")
  }

  async function exists(target: string): Promise<boolean> {
    return fs.stat(target).then(() => true).catch(() => false)
  }

  /**
   * Get or create a user-specific worktree for the current project.
   * In multi-user mode, each user gets their own worktree to work in isolation.
   */
  export async function getOrCreate(projectID: string, directory: string): Promise<string> {
    if (!isMultiUserMode()) return directory

    const user = User.current()
    if (!user) return directory

    // If directory is already a session worktree (under opencode/worktree/), use it directly
    // Session worktrees are already per-session isolated, no need for additional user worktree
    const worktreeBase = path.join(Global.Path.data, "worktree")
    if (directory.startsWith(worktreeBase)) return directory

    // Check if the project uses git
    const isGit = await fs.stat(path.join(directory, ".git")).then(() => true).catch(() => false)
    if (!isGit) return directory

    const userWorktreeDir = getUserWorktreePath(projectID, user.id)

    // If user worktree already exists, return it
    if (await exists(userWorktreeDir)) {
      log.info("using_existing_worktree", {
        userID: user.id,
        projectID,
        directory: userWorktreeDir,
      })
      return userWorktreeDir
    }

    // Create new user worktree
    await createUserWorktree(directory, userWorktreeDir, user.id, user.username)

    return userWorktreeDir
  }

  /**
   * Get the path where user worktrees are stored for a project.
   */
  export function getUserWorktreePath(projectID: string, userID: string): string {
    return path.join(Global.Path.data, "user-worktree", projectID, userID)
  }

  /**
   * Create a new worktree for a user.
   */
  async function createUserWorktree(
    mainDirectory: string,
    worktreeDir: string,
    userID: string,
    username: string,
  ): Promise<void> {
    log.info("creating_user_worktree", { userID, username, worktreeDir })

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(worktreeDir), { recursive: true })

    const branch = `user/${username}`

    // Check if branch exists
    const branchCheck = await $`git show-ref --verify --quiet refs/heads/${branch}`
      .quiet()
      .nothrow()
      .cwd(mainDirectory)

    if (branchCheck.exitCode === 0) {
      // Branch exists, create worktree from it
      const created = await $`git worktree add ${worktreeDir} ${branch}`
        .quiet()
        .nothrow()
        .cwd(mainDirectory)
      if (created.exitCode !== 0) {
        throw new CreateFailedError({
          message: errorText(created) || "Failed to create user worktree",
        })
      }
    } else {
      // Create new branch and worktree
      const created = await $`git worktree add -b ${branch} ${worktreeDir}`
        .quiet()
        .nothrow()
        .cwd(mainDirectory)
      if (created.exitCode !== 0) {
        throw new CreateFailedError({
          message: errorText(created) || "Failed to create user worktree with new branch",
        })
      }
    }

    log.info("created_user_worktree", {
      userID,
      username,
      branch,
      directory: worktreeDir,
    })
  }

  /**
   * List all user worktrees for a project.
   */
  export async function list(projectID: string): Promise<{ userID: string; directory: string }[]> {
    const root = path.join(Global.Path.data, "user-worktree", projectID)
    const dirs = await fs.readdir(root).catch(() => [])

    return dirs.map((userID) => ({
      userID,
      directory: path.join(root, userID),
    }))
  }

  /**
   * Remove a user's worktree for a project.
   */
  export async function remove(projectID: string, userID: string, mainDirectory: string): Promise<void> {
    const worktreeDir = getUserWorktreePath(projectID, userID)

    if (!(await exists(worktreeDir))) return

    const removed = await $`git worktree remove --force ${worktreeDir}`
      .quiet()
      .nothrow()
      .cwd(mainDirectory)
    if (removed.exitCode !== 0) {
      log.warn("worktree_remove_failed", {
        userID,
        projectID,
        error: errorText(removed),
      })
    }

    log.info("removed_user_worktree", { userID, projectID })
  }
}
