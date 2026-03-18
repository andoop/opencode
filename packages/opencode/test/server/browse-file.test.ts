import { describe, expect, test } from "bun:test"
import path from "path"
import { Server } from "../../src/server/server"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

describe("browse.file", () => {
  test("lists directories without returning files", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "alpha", "one.txt"), "1")
        await Bun.write(path.join(dir, "beta", "two.txt"), "2")
        await Bun.write(path.join(dir, "top.txt"), "3")
      },
    })

    const app = Server.App()
    const response = await app.request(
      `/browse/file?directory=${encodeURIComponent(tmp.path)}&path=&type=directory&limit=1`,
    )

    expect(response.status).toBe(200)

    const body = (await response.json()) as Array<{
      name: string
      type: string
      absolute: string
    }>

    expect(body).toHaveLength(1)
    expect(body[0].type).toBe("directory")
    expect(body[0].name).toBe("alpha")
    expect(body[0].absolute.startsWith(tmp.path)).toBe(true)
  })

  test("direct /file route also uses lightweight listing", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "alpha", "one.txt"), "1")
        await Bun.write(path.join(dir, "top.txt"), "3")
      },
    })

    const app = Server.App()
    const response = await app.request(`/file?directory=${encodeURIComponent(tmp.path)}&path=`)

    expect(response.status).toBe(200)

    const body = (await response.json()) as Array<{
      name: string
      type: string
      absolute: string
    }>

    expect(body.map((item) => item.name)).toEqual(["alpha", "top.txt"])
    expect(body[0].type).toBe("directory")
    expect(body[1].type).toBe("file")
  })
})
