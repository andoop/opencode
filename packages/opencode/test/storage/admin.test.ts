import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { StorageAdmin } from "../../src/storage/admin"

async function writeJson(target: string, value: unknown) {
  await fs.mkdir(path.dirname(target), { recursive: true })
  await Bun.write(target, JSON.stringify(value, null, 2))
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-storage-admin-"))
  const roots = {
    data: path.join(root, "data"),
    cache: path.join(root, "cache"),
  }
  await fs.mkdir(roots.cache, { recursive: true })
  await Bun.write(path.join(roots.cache, "cache.bin"), "cache")
  await writeJson(path.join(roots.data, "storage", "user", "usr_alive.json"), {
    id: "usr_alive",
    username: "alive",
    email: "alive@example.com",
    role: "user",
    status: "active",
    permission: { level: "full" },
    time: { created: 1, updated: 1 },
  })
  await writeJson(path.join(roots.data, "storage", "project_registry", "project.json"), {
    id: "project",
    project_id: "git_alive",
    directory: "/tmp/project",
    visibility: { mode: "all", user_ids: [] },
    time: { created: 1, updated: 1 },
  })
  await writeJson(path.join(roots.data, "workspace", "usr_alive", "wsp_alive", "workspace.json"), {
    id: "wsp_alive",
    name: "Alive",
    directory: path.join(roots.data, "workspace", "usr_alive", "wsp_alive"),
    userID: "usr_alive",
    primaryProjectID: "git_alive",
    projects: [],
    time: { created: 1, updated: 1 },
  })
  await Bun.write(path.join(roots.data, "workspace", "usr_alive", "wsp_alive", "large.bin"), "alive workspace")
  await writeJson(path.join(roots.data, "workspace", "usr_missing", "wsp_orphan", "workspace.json"), {
    id: "wsp_orphan",
    name: "Orphan",
    directory: path.join(roots.data, "workspace", "usr_missing", "wsp_orphan"),
    userID: "usr_missing",
    primaryProjectID: "git_alive",
    projects: [],
    time: { created: 1, updated: 1 },
  })
  const sessionDir = path.join(roots.data, "workspace", "usr_alive", "wsp_alive", "sessions", "ses_archived")
  await fs.mkdir(sessionDir, { recursive: true })
  await Bun.write(path.join(sessionDir, "worktree.txt"), "archived")
  await fs.mkdir(path.join(roots.data, "snapshot", "wsp_alive"), { recursive: true })
  await Bun.write(path.join(roots.data, "snapshot", "wsp_alive", "workspace.snapshot"), "workspace snapshot")
  await fs.mkdir(path.join(roots.data, "snapshot", "ses_archived"), { recursive: true })
  await Bun.write(path.join(roots.data, "snapshot", "ses_archived", "session.snapshot"), "session snapshot")
  await fs.mkdir(path.join(roots.data, "snapshot", "stale_scope"), { recursive: true })
  await Bun.write(path.join(roots.data, "snapshot", "stale_scope", "stale.snapshot"), "stale snapshot")
  await writeJson(path.join(roots.data, "storage", "session", "wsp_alive", "ses_archived.json"), {
    id: "ses_archived",
    slug: "archived",
    workspaceID: "wsp_alive",
    projectID: "git_alive",
    userID: "usr_alive",
    directory: sessionDir,
    cwd: sessionDir,
    roots: [],
    title: "Archived",
    version: "test",
    time: { created: 1, updated: 2, archived: 3 },
  })
  await writeJson(path.join(roots.data, "storage", "session", "wsp_missing", "ses_dangling.json"), {
    id: "ses_dangling",
    slug: "dangling",
    workspaceID: "wsp_missing",
    projectID: "git_alive",
    directory: path.join(roots.data, "missing"),
    cwd: path.join(roots.data, "missing"),
    roots: [],
    title: "Dangling",
    version: "test",
    time: { created: 1, updated: 1 },
  })
  await fs.mkdir(path.join(roots.data, "user-worktree", "git_missing", "usr_missing"), { recursive: true })
  await Bun.write(path.join(roots.data, "user-worktree", "git_missing", "usr_missing", "file.txt"), "orphan")
  return {
    root,
    roots,
  }
}

describe("StorageAdmin", () => {
  test("summarizes storage categories", async () => {
    const fx = await fixture()
    try {
      const summary = await StorageAdmin.summary({}, { roots: fx.roots })
      expect(summary.categories.find((item) => item.category === "workspaces")?.count).toBe(0)
      expect(summary.categories.find((item) => item.category === "closedWorkspaces")?.count).toBe(1)
      expect(summary.categories.find((item) => item.category === "snapshots")?.count).toBe(3)
      expect(summary.categories.find((item) => item.category === "cache")?.count).toBe(1)
      expect(summary.categories.find((item) => item.category === "archivedSessions")?.count).toBe(1)
      expect(summary.categories.find((item) => item.category === "orphanWorkspaces")?.count).toBe(1)
      expect(summary.categories.find((item) => item.category === "orphanUserWorktrees")?.count).toBe(1)
      expect(summary.categories.find((item) => item.category === "danglingStorage")?.count).toBe(1)
      expect(summary.users.map((item) => item.userID)).toContain("usr_alive")
      expect(summary.users.map((item) => item.userID)).toContain("usr_missing")
      expect(summary.high_risk).toBe(1)
    } finally {
      await fs.rm(fx.root, { recursive: true, force: true })
    }
  })

  test("requires force for high risk archived sessions", async () => {
    const fx = await fixture()
    try {
      const safe = await StorageAdmin.plan({ categories: ["archivedSessions"], force: false }, { roots: fx.roots })
      expect(safe.items).toHaveLength(0)
      expect(safe.skipped).toHaveLength(1)
      const forced = await StorageAdmin.plan({ categories: ["archivedSessions"], force: true }, { roots: fx.roots })
      expect(forced.items).toHaveLength(1)
      const filtered = await StorageAdmin.plan(
        { categories: ["archivedSessions"], userID: "usr_missing", force: true },
        { roots: fx.roots },
      )
      expect(filtered.items).toHaveLength(0)
      const workspace = await StorageAdmin.plan({ categories: ["workspaces"], force: true }, { roots: fx.roots })
      expect(workspace.items).toHaveLength(0)
      const closed = await StorageAdmin.plan({ categories: ["closedWorkspaces"], force: false }, { roots: fx.roots })
      expect(closed.items).toHaveLength(1)
    } finally {
      await fs.rm(fx.root, { recursive: true, force: true })
    }
  })

  test("uses backend visible sessions instead of frontend active state", async () => {
    const fx = await fixture()
    try {
      await writeJson(path.join(fx.roots.data, "storage", "session", "wsp_alive", "ses_unarchived.json"), {
        id: "ses_unarchived",
        slug: "unarchived",
        workspaceID: "wsp_alive",
        projectID: "git_alive",
        userID: "usr_alive",
        directory: path.join(fx.roots.data, "workspace", "usr_alive", "wsp_alive", "sessions", "ses_unarchived"),
        cwd: path.join(fx.roots.data, "workspace", "usr_alive", "wsp_alive", "sessions", "ses_unarchived"),
        roots: [],
        title: "Unarchived",
        version: "test",
        time: { created: 1, updated: 2 },
      })
      const stale = await StorageAdmin.summary({ activeWorkspaceIDs: [] }, { roots: fx.roots })
      expect(stale.categories.find((item) => item.category === "closedWorkspaces")?.count).toBe(0)
      expect(stale.categories.find((item) => item.category === "workspaces")?.count).toBe(1)
      const active = await StorageAdmin.summary({ activeWorkspaceIDs: ["wsp_alive"] }, { roots: fx.roots })
      expect(active.categories.find((item) => item.category === "closedWorkspaces")?.count).toBe(0)
      expect(active.categories.find((item) => item.category === "workspaces")?.count).toBe(1)
    } finally {
      await fs.rm(fx.root, { recursive: true, force: true })
    }
  })

  test("keeps snapshots for active visible workspaces and sessions", async () => {
    const fx = await fixture()
    try {
      await writeJson(path.join(fx.roots.data, "storage", "session", "wsp_alive", "ses_open.json"), {
        id: "ses_open",
        slug: "open",
        workspaceID: "wsp_alive",
        projectID: "git_alive",
        userID: "usr_alive",
        directory: path.join(fx.roots.data, "workspace", "usr_alive", "wsp_alive", "sessions", "ses_open"),
        cwd: path.join(fx.roots.data, "workspace", "usr_alive", "wsp_alive", "sessions", "ses_open"),
        roots: [],
        title: "Open",
        version: "test",
        time: { created: 1, updated: 2 },
      })
      await fs.mkdir(path.join(fx.roots.data, "snapshot", "ses_open"), { recursive: true })
      await Bun.write(path.join(fx.roots.data, "snapshot", "ses_open", "session.snapshot"), "session snapshot")
      const summary = await StorageAdmin.summary({ activeWorkspaceIDs: [], activeSessionIDs: [] }, { roots: fx.roots })
      const snapshots = summary.items.filter((item) => item.category === "snapshots")
      expect(snapshots.map((item) => item.metadata.scope)).toEqual(["ses_archived", "stale_scope"])
      const plan = await StorageAdmin.plan(
        { categories: ["snapshots"], activeWorkspaceIDs: [], activeSessionIDs: [] },
        { roots: fx.roots },
      )
      expect(plan.items.map((item) => item.metadata.scope)).toEqual(["ses_archived", "stale_scope"])
    } finally {
      await fs.rm(fx.root, { recursive: true, force: true })
    }
  })

  test("does not treat another user's open workspace as closed", async () => {
    const fx = await fixture()
    try {
      await writeJson(path.join(fx.roots.data, "storage", "session", "wsp_alive", "ses_open.json"), {
        id: "ses_open",
        slug: "open",
        workspaceID: "wsp_alive",
        projectID: "git_alive",
        userID: "usr_alive",
        directory: path.join(fx.roots.data, "workspace", "usr_alive", "wsp_alive", "sessions", "ses_open"),
        cwd: path.join(fx.roots.data, "workspace", "usr_alive", "wsp_alive", "sessions", "ses_open"),
        roots: [],
        title: "Open",
        version: "test",
        time: { created: 1, updated: 2 },
      })
      await fs.mkdir(path.join(fx.roots.data, "snapshot", "ses_open"), { recursive: true })
      await Bun.write(path.join(fx.roots.data, "snapshot", "ses_open", "session.snapshot"), "session snapshot")
      const summary = await StorageAdmin.summary(
        { activeWorkspaceIDs: [], activeSessionIDs: [] },
        { roots: fx.roots, viewerUserID: "usr_admin" },
      )
      expect(summary.categories.find((item) => item.category === "closedWorkspaces")?.count).toBe(0)
      expect(summary.categories.find((item) => item.category === "workspaces")?.count).toBe(1)
      expect(summary.items.filter((item) => item.category === "snapshots").map((item) => item.metadata.scope)).toEqual([
        "ses_archived",
        "stale_scope",
      ])
    } finally {
      await fs.rm(fx.root, { recursive: true, force: true })
    }
  })

  test("does not keep workspace visible for child sessions only", async () => {
    const fx = await fixture()
    try {
      await writeJson(path.join(fx.roots.data, "storage", "session", "wsp_alive", "ses_child.json"), {
        id: "ses_child",
        slug: "child",
        workspaceID: "wsp_alive",
        projectID: "git_alive",
        userID: "usr_alive",
        parentID: "ses_archived",
        directory: path.join(fx.roots.data, "workspace", "usr_alive", "wsp_alive", "sessions", "ses_child"),
        cwd: path.join(fx.roots.data, "workspace", "usr_alive", "wsp_alive", "sessions", "ses_child"),
        roots: [],
        title: "Child",
        version: "test",
        time: { created: 1, updated: 2 },
      })
      const summary = await StorageAdmin.summary({}, { roots: fx.roots })
      expect(summary.categories.find((item) => item.category === "closedWorkspaces")?.count).toBe(1)
      expect(summary.categories.find((item) => item.category === "workspaces")?.count).toBe(0)
    } finally {
      await fs.rm(fx.root, { recursive: true, force: true })
    }
  })

  test("cleans selected storage objects", async () => {
    const fx = await fixture()
    try {
      const result = await StorageAdmin.cleanup(
        { categories: ["cache", "archivedSessions"], force: true },
        { roots: fx.roots },
      )
      expect(result.failed).toHaveLength(0)
      expect(result.removed.map((item) => item.category).sort()).toEqual(["archivedSessions", "cache"])
      expect(await Bun.file(path.join(fx.roots.cache, "cache.bin")).exists()).toBe(false)
      expect(
        await Bun.file(path.join(fx.roots.data, "storage", "session", "wsp_alive", "ses_archived.json")).exists(),
      ).toBe(false)
      expect(await Bun.file(path.join(fx.roots.data, "snapshot", "ses_archived", "session.snapshot")).exists()).toBe(
        false,
      )
    } finally {
      await fs.rm(fx.root, { recursive: true, force: true })
    }
  })

  test("cleans closed workspaces", async () => {
    const fx = await fixture()
    try {
      const result = await StorageAdmin.cleanup({ categories: ["closedWorkspaces"], force: false }, { roots: fx.roots })
      expect(result.failed).toHaveLength(0)
      expect(result.removed.map((item) => item.category)).toEqual(["closedWorkspaces"])
      expect(
        await Bun.file(path.join(fx.roots.data, "workspace", "usr_alive", "wsp_alive", "workspace.json")).exists(),
      ).toBe(false)
      expect(
        await Bun.file(path.join(fx.roots.data, "storage", "session", "wsp_alive", "ses_archived.json")).exists(),
      ).toBe(false)
      expect(await Bun.file(path.join(fx.roots.data, "snapshot", "wsp_alive", "workspace.snapshot")).exists()).toBe(
        false,
      )
    } finally {
      await fs.rm(fx.root, { recursive: true, force: true })
    }
  })
})
