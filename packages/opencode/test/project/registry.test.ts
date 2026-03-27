import { describe, expect, test } from "bun:test"
import { ProjectRegistry } from "../../src/project/registry"
import { Storage } from "../../src/storage/storage"

describe("ProjectRegistry helpers", () => {
  test("normalizes groups and visibility", () => {
    expect(ProjectRegistry.normalizeGroups([" Beta ", "", "Alpha", "Beta "])).toEqual(["Alpha", "Beta"])
    expect(
      ProjectRegistry.normalizeVisibility({ mode: "include", user_ids: [" user_b ", "", "user_a", "user_b"] }),
    ).toEqual({
      mode: "include",
      user_ids: ["user_a", "user_b"],
    })
  })

  test("applies visibility rules", () => {
    const base = ProjectRegistry.Info.parse({
      id: "proj_1",
      project_id: "git_1",
      directory: "/tmp/demo",
      groups: [],
      visibility: { mode: "all", user_ids: [] },
      time: { created: 1, updated: 1 },
    })
    expect(ProjectRegistry.visibleTo(base)).toBe(true)
    expect(
      ProjectRegistry.visibleTo(
        { ...base, visibility: { mode: "include", user_ids: ["user_1"] } },
        { userID: "user_1", role: "user" },
      ),
    ).toBe(true)
    expect(
      ProjectRegistry.visibleTo(
        { ...base, visibility: { mode: "include", user_ids: ["user_1"] } },
        { userID: "user_2", role: "user" },
      ),
    ).toBe(false)
    expect(
      ProjectRegistry.visibleTo(
        { ...base, visibility: { mode: "exclude", user_ids: ["user_1"] } },
        { userID: "user_1", role: "user" },
      ),
    ).toBe(false)
    expect(
      ProjectRegistry.visibleTo(
        { ...base, visibility: { mode: "exclude", user_ids: ["user_1"] } },
        { userID: "user_2", role: "user" },
      ),
    ).toBe(true)
    expect(
      ProjectRegistry.visibleTo(
        { ...base, visibility: { mode: "include", user_ids: [] } },
        { userID: "user_2", role: "admin" },
      ),
    ).toBe(true)
  })
})

describe("ProjectRegistry legacy data", () => {
  test("fills missing groups and visibility defaults for legacy entries", async () => {
    const id = `registry_${crypto.randomUUID()}`
    await Storage.write(["project_registry", id], {
      id,
      project_id: "git_legacy",
      directory: `/tmp/${id}`,
      name: "Legacy",
      description: "Legacy project",
      time: { created: Date.now(), updated: Date.now() },
    })

    try {
      const item = await ProjectRegistry.get(id)
      expect(item.groups).toEqual([])
      expect(item.visibility).toEqual({ mode: "all", user_ids: [] })
    } finally {
      await Storage.remove(["project_registry", id])
    }
  })
})
