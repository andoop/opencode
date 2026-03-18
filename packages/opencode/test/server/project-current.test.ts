import { describe, expect, test } from "bun:test"
import { Server } from "../../src/server/server"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

describe("project.current", () => {
  test("returns project info without an existing instance", async () => {
    await using tmp = await tmpdir({ git: true })

    const app = Server.App()
    const response = await app.request(`/project/current?directory=${encodeURIComponent(tmp.path)}`)
    expect(response.status).toBe(200)

    const body = (await response.json()) as {
      id: string
      worktree: string
      vcs?: string
    }

    expect(typeof body.id).toBe("string")
    expect(body.worktree).toBe(tmp.path)
    expect(body.vcs).toBe("git")
  })
})
