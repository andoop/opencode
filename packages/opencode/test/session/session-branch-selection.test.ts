import { $ } from "bun"
import { describe, expect, test } from "bun:test"
import path from "path"
import { Project } from "../../src/project/project"
import { Instance } from "../../src/project/instance"
import { Session } from "../../src/session"
import { Log } from "../../src/util/log"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

describe("session branch selection", () => {
  test("prefers the fetched remote ref when the picked branch comes from remote", async () => {
    await using origin = await tmpdir()
    await using seed = await tmpdir({ git: true })
    await using clone = await tmpdir()

    await $`git init --bare --initial-branch=main ${origin.path}`.quiet()

    await $`git branch -M main`.cwd(seed.path).quiet()
    await Bun.write(path.join(seed.path, "branch.txt"), "main\n")
    await $`git add branch.txt`.cwd(seed.path).quiet()
    await $`git commit -m "main"`.cwd(seed.path).quiet()
    await $`git remote add origin ${origin.path}`.cwd(seed.path).quiet()
    await $`git push -u origin main`.cwd(seed.path).quiet()

    await $`git checkout -b topic`.cwd(seed.path).quiet()
    await Bun.write(path.join(seed.path, "branch.txt"), "topic-1\n")
    await $`git add branch.txt`.cwd(seed.path).quiet()
    await $`git commit -m "topic-1"`.cwd(seed.path).quiet()
    await $`git push -u origin topic`.cwd(seed.path).quiet()

    await $`git clone ${origin.path} ${clone.path}`.quiet()
    await $`git checkout -b topic origin/topic`.cwd(clone.path).quiet()

    await Bun.write(path.join(seed.path, "branch.txt"), "topic-2\n")
    await $`git add branch.txt`.cwd(seed.path).quiet()
    await $`git commit -m "topic-2"`.cwd(seed.path).quiet()
    await $`git push`.cwd(seed.path).quiet()

    await $`git fetch origin`.cwd(clone.path).quiet()

    await Instance.provide({
      directory: clone.path,
      fn: async () => {
        const { project } = await Project.fromDirectory(clone.path)
        const local = await $`git rev-parse topic`
          .cwd(clone.path)
          .text()
          .then((x) => x.trim())
        const remote = await $`git rev-parse origin/topic`
          .cwd(clone.path)
          .text()
          .then((x) => x.trim())

        expect(local).not.toBe(remote)

        const session = await Session.create({
          branches: {
            [project.id]: {
              name: "topic",
              group: "remote",
            },
          },
        })

        expect(session.roots[0]?.baseCommit).toBe(remote)
        expect(session.roots[0]?.baseCommit).not.toBe(local)

        await Session.remove(session.id)
      },
    })
  })
})
