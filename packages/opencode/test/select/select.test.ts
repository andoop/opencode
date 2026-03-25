import { test, expect } from "bun:test"
import { Select } from "../../src/select"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

test("ask - returns pending promise", async () => {
  await using tmp = await tmpdir({ git: true })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const promise = Select.ask({
        sessionID: "ses_test",
        title: "Pick one",
        options: [{ label: "Alpha", description: "First choice" }],
      })
      expect(promise).toBeInstanceOf(Promise)
    },
  })
})

test("ask - adds to pending list", async () => {
  await using tmp = await tmpdir({ git: true })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const options = [{ label: "Alpha", description: "First choice", keywords: ["a"] }]
      Select.ask({
        sessionID: "ses_test",
        title: "Pick one",
        placeholder: "Search choices",
        options,
        custom: true,
      })
      const pending = await Select.list()
      expect(pending.length).toBe(1)
      expect(pending[0].options).toEqual(options)
      expect(pending[0].custom).toBe(true)
    },
  })
})

test("reply - resolves the pending ask with selected value", async () => {
  await using tmp = await tmpdir({ git: true })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const askPromise = Select.ask({
        sessionID: "ses_test",
        options: [{ label: "Alpha", description: "First choice" }],
      })

      const pending = await Select.list()
      await Select.reply({
        requestID: pending[0].id,
        value: "Alpha",
        source: "option",
      })

      const result = await askPromise
      expect(result).toEqual({
        value: "Alpha",
        source: "option",
      })
    },
  })
})

test("reject - throws RejectedError", async () => {
  await using tmp = await tmpdir({ git: true })
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const askPromise = Select.ask({
        sessionID: "ses_test",
        options: [{ label: "Alpha", description: "First choice" }],
      })

      const pending = await Select.list()
      await Select.reject(pending[0].id)

      await expect(askPromise).rejects.toBeInstanceOf(Select.RejectedError)
    },
  })
})
