import { describe, expect, test } from "bun:test"
import path from "path"
import { File } from "../../src/file"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

describe("File.search", () => {
  test("returns results on the first lazy scan", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(path.join(dir, "src", "file.ts"), "export const foo = 1")
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await File.search({
          query: "file",
          type: "file",
          limit: 10,
        })

        expect(result).toContain("src/file.ts")
      },
    })
  })
})
