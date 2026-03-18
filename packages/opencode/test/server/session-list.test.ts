import { describe, expect, test } from "bun:test"
import path from "path"
import { Instance } from "../../src/project/instance"
import { Server } from "../../src/server/server"
import { Session } from "../../src/session"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

const projectRoot = path.join(__dirname, "../..")
Log.init({ print: false })

describe("session.list", () => {
  test("filters by directory", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const app = Server.App()

        const first = await Session.create({})

        const otherDir = path.join(projectRoot, "..", "__session_list_other")
        const second = await Instance.provide({
          directory: otherDir,
          fn: async () => Session.create({}),
        })

        const response = await app.request(`/session?directory=${encodeURIComponent(projectRoot)}`)
        expect(response.status).toBe(200)

        const body = (await response.json()) as unknown[]
        const ids = body
          .map((s) => (typeof s === "object" && s && "id" in s ? (s as { id: string }).id : undefined))
          .filter((x): x is string => typeof x === "string")

        expect(ids).toContain(first.id)
        expect(ids).not.toContain(second.id)
      },
    })
  })

  test("supports directory-scoped listing without an active instance", async () => {
    await using firstDir = await tmpdir({ git: true })
    await using secondDir = await tmpdir({ git: true })

    const first = await Instance.provide({
      directory: firstDir.path,
      fn: async () => Session.create({}),
    })

    const second = await Instance.provide({
      directory: secondDir.path,
      fn: async () => Session.create({}),
    })

    const app = Server.App()
    const response = await app.request(`/session?directory=${encodeURIComponent(firstDir.path)}&roots=true`)
    expect(response.status).toBe(200)

    const body = (await response.json()) as unknown[]
    const ids = body
      .map((s) => (typeof s === "object" && s && "id" in s ? (s as { id: string }).id : undefined))
      .filter((x): x is string => typeof x === "string")

    expect(ids).toContain(first.id)
    expect(ids).not.toContain(second.id)
  })
})
