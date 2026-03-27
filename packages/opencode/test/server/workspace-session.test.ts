import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Server } from "../../src/server/server"
import { Log } from "../../src/util/log"
import { Session } from "../../src/session"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

describe("workspace session flow", () => {
  test("creates a workspace and a multi-root session", async () => {
    await using first = await tmpdir({ git: true })
    await using second = await tmpdir({ git: true })

    const app = Server.App()
    const workspaceResponse = await app.request("/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directories: [first.path, second.path],
      }),
    })
    expect(workspaceResponse.status).toBe(200)
    const workspace = (await workspaceResponse.json()) as {
      id: string
      directory: string
      projects: Array<{ slug: string; sourceDirectory: string }>
    }
    expect(workspace.projects).toHaveLength(2)

    const sessionResponse = await app.request(`/session?directory=${encodeURIComponent(workspace.directory)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    if (sessionResponse.status !== 200) {
      throw new Error(await sessionResponse.text())
    }
    const session = (await sessionResponse.json()) as Session.Info
    expect(session.workspaceID).toBe(workspace.id)
    expect(session.roots).toHaveLength(2)
    expect(session.directory).toBe(path.join(workspace.directory, "sessions", session.id))

    for (const root of session.roots) {
      expect(root.sessionWorktreeDirectory.startsWith(path.join(session.directory, "roots"))).toBe(true)
      const exists = await fs
        .stat(root.sessionWorktreeDirectory)
        .then(() => true)
        .catch(() => false)
      expect(exists).toBe(true)
    }

    const listed = await app.request(`/session?directory=${encodeURIComponent(workspace.directory)}`)
    if (listed.status !== 200) {
      throw new Error(await listed.text())
    }
    const sessions = (await listed.json()) as Session.Info[]
    expect(sessions.some((item) => item.id === session.id)).toBe(true)
  })
})
