import { describe, expect, test } from "bun:test"
import { Server } from "../../src/server/server"
import { Session } from "../../src/session"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

describe("session.list", () => {
  test("filters by directory", async () => {
    await using firstDir = await tmpdir({ git: true })
    await using secondDir = await tmpdir({ git: true })
    const app = Server.App()

    const firstWorkspaceResponse = await app.request("/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directories: [firstDir.path] }),
    })
    const firstWorkspace = (await firstWorkspaceResponse.json()) as { directory: string }
    const secondWorkspaceResponse = await app.request("/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directories: [secondDir.path] }),
    })
    const secondWorkspace = (await secondWorkspaceResponse.json()) as { directory: string }

    const firstResponse = await app.request(`/session?directory=${encodeURIComponent(firstWorkspace.directory)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    const first = (await firstResponse.json()) as Session.Info
    const secondResponse = await app.request(`/session?directory=${encodeURIComponent(secondWorkspace.directory)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    const second = (await secondResponse.json()) as Session.Info

    const response = await app.request(`/session?directory=${encodeURIComponent(firstWorkspace.directory)}`)
    expect(response.status).toBe(200)

    const body = (await response.json()) as Session.Info[]
    const ids = body.map((item) => item.id)

    expect(ids).toContain(first.id)
    expect(ids).not.toContain(second.id)
  })

  test("supports directory-scoped listing without an active instance", async () => {
    await using firstDir = await tmpdir({ git: true })
    const app = Server.App()

    const workspaceResponse = await app.request("/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directories: [firstDir.path] }),
    })
    const workspace = (await workspaceResponse.json()) as { directory: string }

    const firstResponse = await app.request(`/session?directory=${encodeURIComponent(workspace.directory)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    const first = (await firstResponse.json()) as Session.Info

    const response = await app.request(`/session?directory=${encodeURIComponent(first.directory)}&roots=true`)
    expect(response.status).toBe(200)

    const body = (await response.json()) as Session.Info[]
    const ids = body.map((item) => item.id)

    expect(ids).toContain(first.id)
  })

  test("supports directory-scoped listing for a plain project root", async () => {
    await using firstDir = await tmpdir({ git: true })
    await using secondDir = await tmpdir({ git: true })
    const app = Server.App()

    const firstWorkspaceResponse = await app.request("/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directories: [firstDir.path] }),
    })
    const firstWorkspace = (await firstWorkspaceResponse.json()) as { directory: string }
    const secondWorkspaceResponse = await app.request("/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ directories: [secondDir.path] }),
    })
    const secondWorkspace = (await secondWorkspaceResponse.json()) as { directory: string }

    const firstResponse = await app.request(`/session?directory=${encodeURIComponent(firstWorkspace.directory)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    const first = (await firstResponse.json()) as Session.Info
    const secondResponse = await app.request(`/session?directory=${encodeURIComponent(secondWorkspace.directory)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    const second = (await secondResponse.json()) as Session.Info

    const response = await app.request(`/session?directory=${encodeURIComponent(firstDir.path)}&roots=true`)
    if (response.status !== 200) {
      throw new Error(await response.text())
    }

    const body = (await response.json()) as Session.Info[]
    const ids = body.map((item) => item.id)

    expect(ids).toContain(first.id)
    expect(ids).not.toContain(second.id)
  })
})
