import { describe, expect, test } from "bun:test"
import os from "os"
import path from "path"
import fs from "fs/promises"
import { DataRoot } from "../../src/global/root"
import { Global } from "../../src/global"

describe("DataRoot", () => {
  test("derives Global.Path from the portable root", async () => {
    const root = DataRoot.current().root
    expect(DataRoot.current().configured).toBe(true)
    expect(Global.Path.data).toBe(path.join(root, "data"))
    expect(Global.Path.config).toBe(path.join(root, "config"))
    expect(Global.Path.cache).toBe(path.join(root, "cache"))
    expect(Global.Path.state).toBe(path.join(root, "state"))
    expect(await Bun.file(path.join(root, "manifest.json")).json()).toMatchObject({
      marker: DataRoot.Manifest.marker,
      layout: DataRoot.Manifest.version,
    })
  })

  test("initializes an empty portable root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-portable-root-"))
    await DataRoot.initialize(root)
    expect(await Bun.file(path.join(root, "manifest.json")).json()).toMatchObject({
      marker: DataRoot.Manifest.marker,
      layout: DataRoot.Manifest.version,
    })
    await Promise.all(
      ["data", "config", "cache", "state"].map(async (item) => {
        expect(
          await fs
            .stat(path.join(root, item))
            .then((stat) => stat.isDirectory())
            .catch(() => false),
        ).toBe(true)
      }),
    )
    await fs.rm(root, { recursive: true, force: true })
  })

  test("rejects unknown non-empty directories", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-portable-root-"))
    await Bun.write(path.join(root, "random.txt"), "nope")
    const result = await DataRoot.validate(root)
    expect(result.ok).toBe(false)
    expect(result.reason).toContain("Directory must be empty")
    await fs.rm(root, { recursive: true, force: true })
  })
})
