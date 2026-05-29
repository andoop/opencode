import { describe, expect, test } from "bun:test"
import os from "os"
import path from "path"
import fs from "fs/promises"
import { Server } from "../../src/server/server"
import { DataRoot } from "../../src/global/root"

describe("server data-root", () => {
  test("returns portable root status", async () => {
    const response = await Server.App().request("/data-root/status")
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      configured: true,
      root: process.env.OPENCODE_PORTABLE_ROOT,
      marker: DataRoot.Manifest.marker,
      layout: DataRoot.Manifest.version,
      needsSetup: false,
    })
  })

  test("validates and binds an empty portable root", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-portable-root-"))
    const app = Server.App()
    const validate = await app.request("/data-root/validate", {
      method: "POST",
      body: JSON.stringify({ path: root }),
      headers: {
        "content-type": "application/json",
      },
    })
    expect(validate.status).toBe(200)
    expect(await validate.json()).toMatchObject({
      ok: true,
      root,
      initialized: false,
    })

    const bind = await app.request("/data-root/bind", {
      method: "POST",
      body: JSON.stringify({ path: root }),
      headers: {
        "content-type": "application/json",
      },
    })
    expect(bind.status).toBe(200)
    expect(await bind.json()).toMatchObject({
      configured: true,
      root,
      restartRequired: false,
    })
    expect(await Bun.file(path.join(root, "manifest.json")).json()).toMatchObject({
      marker: DataRoot.Manifest.marker,
      layout: DataRoot.Manifest.version,
    })
  })
})
