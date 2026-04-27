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
  }, 30000)

  test("uploads attachments into the session temp directory", async () => {
    await using first = await tmpdir({ git: true })

    const app = Server.App()
    const sessionResponse = await app.request(`/session?directory=${encodeURIComponent(first.path)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(sessionResponse.status).toBe(200)
    const session = (await sessionResponse.json()) as Session.Info

    const form = new FormData()
    form.append("file", new File(["hello"], "../log.zip", { type: "application/zip" }))
    const response = await app.request(`/session/${session.id}/attachment`, {
      method: "POST",
      headers: {
        "x-opencode-directory": session.directory,
      },
      body: form,
    })

    if (response.status !== 200) {
      throw new Error(await response.text())
    }
    const attachment = (await response.json()) as { path: string; url: string; filename: string; size: number }
    expect(attachment.filename).toBe("log.zip")
    expect(attachment.size).toBe(5)
    expect(attachment.url).toBe(`file://${attachment.path}`)
    expect(attachment.path.startsWith(path.join(session.directory, ".tmp", "attachments"))).toBe(true)
    expect(path.basename(attachment.path)).not.toContain("..")
    expect(await Bun.file(attachment.path).text()).toBe("hello")

    const duplicate = new FormData()
    duplicate.append("file", new File(["world"], "../log.zip", { type: "application/zip" }))
    const duplicateResponse = await app.request(`/session/${session.id}/attachment`, {
      method: "POST",
      headers: {
        "x-opencode-directory": session.directory,
      },
      body: duplicate,
    })
    expect(duplicateResponse.status).toBe(200)
    const duplicateAttachment = (await duplicateResponse.json()) as { path: string; filename: string }
    expect(duplicateAttachment.filename).toBe("log-1.zip")
    expect(await Bun.file(duplicateAttachment.path).text()).toBe("world")
  }, 30000)

  test("rejects attachments larger than 500MB", async () => {
    await using first = await tmpdir({ git: true })

    const app = Server.App()
    const sessionResponse = await app.request(`/session?directory=${encodeURIComponent(first.path)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(sessionResponse.status).toBe(200)
    const session = (await sessionResponse.json()) as Session.Info

    const response = await app.request(`/session/${session.id}/attachment`, {
      method: "POST",
      headers: {
        "x-opencode-attachment-size": String(501 * 1024 * 1024),
        "x-opencode-directory": session.directory,
      },
    })

    expect(response.status).toBe(413)
  }, 30000)
})
