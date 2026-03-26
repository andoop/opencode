import { expect, test } from "bun:test"
import path from "path"
import { Command } from "../src/command"
import { Instance } from "../src/project/instance"
import { tmpdir } from "./fixture/fixture"

test("lists only enabled commands", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "opencode.json"),
        JSON.stringify({
          $schema: "https://opencode.ai/config.json",
          command: {
            test: {
              template: "run tests",
            },
          },
          commands: {
            init: false,
            test: false,
          },
        }),
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const commands = await Command.list()
      expect(commands.map((item) => item.name)).not.toContain("init")
      expect(commands.map((item) => item.name)).not.toContain("test")
      expect(commands.map((item) => item.name)).toContain("review")
    },
  })
})
