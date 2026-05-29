import fs from "fs/promises"
import path from "path"
import os from "os"
import { DataRoot } from "./root"

export namespace Global {
  export const Path = {
    // Allow override via OPENCODE_TEST_HOME for test isolation
    get home() {
      return process.env.OPENCODE_TEST_HOME || os.homedir()
    },
    get data() {
      return DataRoot.pathFor().data
    },
    get bin() {
      return path.join(Global.Path.data, "bin")
    },
    get log() {
      return path.join(Global.Path.data, "log")
    },
    get cache() {
      return DataRoot.pathFor().cache
    },
    get config() {
      return DataRoot.pathFor().config
    },
    get state() {
      return DataRoot.pathFor().state
    },
  }
}

if (DataRoot.isConfigured()) {
  await DataRoot.ensure()
  await Promise.all([
    fs.mkdir(Global.Path.data, { recursive: true }),
    fs.mkdir(Global.Path.cache, { recursive: true }),
    fs.mkdir(Global.Path.config, { recursive: true }),
    fs.mkdir(Global.Path.state, { recursive: true }),
    fs.mkdir(Global.Path.log, { recursive: true }),
    fs.mkdir(Global.Path.bin, { recursive: true }),
  ])
}

const CACHE_VERSION = "21"

const version = DataRoot.isConfigured()
  ? await Bun.file(path.join(Global.Path.cache, "version"))
      .text()
      .catch(() => "0")
  : CACHE_VERSION

if (DataRoot.isConfigured() && version !== CACHE_VERSION) {
  try {
    const contents = await fs.readdir(Global.Path.cache)
    await Promise.all(
      contents.map((item) =>
        fs.rm(path.join(Global.Path.cache, item), {
          recursive: true,
          force: true,
        }),
      ),
    )
  } catch (e) {}
  await Bun.file(path.join(Global.Path.cache, "version")).write(CACHE_VERSION)
}
