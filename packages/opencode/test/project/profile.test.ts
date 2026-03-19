import { describe, expect, test } from "bun:test"
import { GroupRegistry } from "../../src/project/group-registry"
import { Instance } from "../../src/project/instance"
import { ProjectProfile } from "../../src/project/profile"
import { ProjectRegistry } from "../../src/project/registry"
import { SystemPrompt } from "../../src/session/system"
import { Log } from "../../src/util/log"
import { Workspace } from "../../src/workspace"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

describe("ProjectProfile.context", () => {
  test("injects all workspace project profiles into project context", async () => {
    await using app = await tmpdir({ git: true })
    await using api = await tmpdir({ git: true })
    const group = await GroupRegistry.add({
      name: "Platform",
      description: "Shared platform work",
      profile_markdown: "Coordinate changes across projects.",
    })
    const appProject = await ProjectRegistry.add({
      directory: app.path,
      name: "App",
      description: "User-facing application",
      profile_markdown: "App profile body",
      group_ids: [group.id],
    })
    const apiProject = await ProjectRegistry.add({
      directory: api.path,
      name: "API",
      description: "Backend service",
      profile_markdown: "API profile body",
    })
    const workspace = await Workspace.create({
      name: "Product Workspace",
      directories: [app.path, api.path],
      primaryProjectID: appProject.project_id,
      selected_group_ids: [group.id],
    })

    try {
      await Instance.provide({
        directory: workspace.directory,
        fn: async () => {
          const context = await ProjectProfile.context()
          expect(context).toContain("<project-context>")
          expect(context).toContain("Workspace: Product Workspace")
          expect(context).toContain("Selected groups: Platform")
          expect(context).toContain(`Workspace projects: App [Platform]; API [未分组]`)
          expect(context).toContain("## Project Profiles")
          expect(context).toContain("### App")
          expect(context).toContain(`Directory: ${app.path}`)
          expect(context).toContain("User-facing application")
          expect(context).toContain("App profile body")
          expect(context).toContain("### API")
          expect(context).toContain(`Directory: ${api.path}`)
          expect(context).toContain("Backend service")
          expect(context).toContain("API profile body")
          expect(context).not.toContain("Current project:")

          const [system] = await SystemPrompt.projectContext()
          expect(system).toBe(context)
        },
      })
    } finally {
      await Instance.disposeAll()
      await Workspace.remove(workspace.id)
      await ProjectRegistry.remove(appProject.id)
      await ProjectRegistry.remove(apiProject.id)
      await GroupRegistry.remove(group.id)
    }
  })

  test("falls back to a single-project workspace context", async () => {
    await using tmp = await tmpdir({ git: true })
    const project = await ProjectRegistry.add({
      directory: tmp.path,
      name: "CLI",
      description: "Terminal entrypoint",
      profile_markdown: "CLI profile body",
    })

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const context = await ProjectProfile.context()
          expect(context).toContain("Workspace: Single project workspace")
          expect(context).toContain(`Workspace projects: CLI [未分组]`)
          expect(context).toContain("### CLI")
          expect(context).toContain(`Directory: ${tmp.path}`)
          expect(context).toContain("Terminal entrypoint")
          expect(context).toContain("CLI profile body")
          expect(context).not.toContain("Current project:")
        },
      })
    } finally {
      await Instance.disposeAll()
      await ProjectRegistry.remove(project.id)
    }
  })
})
