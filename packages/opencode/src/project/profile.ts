import { GroupRegistry } from "./group-registry"
import { Instance } from "./instance"
import { ProjectRegistry } from "./registry"

type Item = {
  projectID?: string
  name?: string
  directory: string
  description?: string
  profile_markdown?: string
  groups: string[]
  primary?: boolean
}

async function names(ids?: string[], fallback?: string[]) {
  if (ids?.length) {
    const resolved = await GroupRegistry.names(ids)
    if (resolved.length > 0) return resolved
  }
  if (fallback?.length) return fallback
  return ["未分组"]
}

async function currentProjectRegistry() {
  if (Instance.project.vcs !== "git") return
  return ProjectRegistry.findByProjectID(Instance.project.id)
}

async function currentProject() {
  const target = await currentProjectRegistry()
  const item = target ?? {
    project_id: Instance.project.id,
    name: Instance.project.name,
    directory: Instance.project.worktree,
    description: Instance.project.description,
    groups: Instance.project.groups,
    group_ids: Instance.project.group_ids,
    profile_markdown: Instance.project.profile_markdown,
  }
  return {
    projectID: item.project_id,
    name: item.name,
    directory: item.directory,
    description: item.description,
    profile_markdown: item.profile_markdown,
    groups: await names(item.group_ids, item.groups),
  } satisfies Item
}

async function groupItems(ids: string[]) {
  const items = await Promise.all(ids.map((id) => GroupRegistry.get(id).catch(() => undefined)))
  return items.filter((item): item is GroupRegistry.Info => !!item)
}

async function workspaceProjects() {
  const workspace = Instance.workspace
  if (!workspace) return [await currentProject()]
  return Promise.all(
    workspace.projects.map(async (item) => {
      const match = await ProjectRegistry.findByProjectID(item.projectID)
      return {
        projectID: item.projectID,
        directory: item.sourceDirectory,
        name: match?.name ?? item.name,
        description: match?.description ?? item.description,
        profile_markdown: match?.profile_markdown,
        groups: await names(match?.group_ids ?? item.group_ids, match?.groups ?? item.groups),
        primary: item.primary,
      } satisfies Item
    }),
  )
}

function list(items: Item[]) {
  return items.map((item) => `${item.name ?? item.directory} [${item.groups.join(", ")}]`).join("; ")
}

function section(item: Item) {
  return [
    `### ${item.name ?? item.directory}`,
    `Directory: ${item.directory}`,
    `Groups: ${item.groups.join(", ")}`,
    ...(item.description ? ["", item.description] : []),
    ...(item.profile_markdown ? ["", item.profile_markdown] : []),
    "",
  ]
}

export namespace ProjectProfile {
  export async function context() {
    const workspace = Instance.workspace
    const projects = await workspaceProjects()
    const lines = ["<project-context>"]

    if (workspace) {
      const selected = await names(workspace.selected_group_ids, workspace.selected_groups)
      lines.push(`Workspace: ${workspace.name}`)
      if (selected[0] !== "未分组" || workspace.selected_group_ids.length > 0 || workspace.selected_groups.length > 0) {
        lines.push(`Selected groups: ${selected.join(", ")}`)
      }
    } else {
      lines.push("Workspace: Single project workspace")
    }

    lines.push(`Workspace projects: ${list(projects)}`, "", "## Project Profiles", ...projects.flatMap(section), "</project-context>")
    return lines.join("\n")
  }

  export async function summary() {
    const project = Instance.project
    const workspace = Instance.workspace
    const registry = await currentProjectRegistry()
    const projectGroups = await names(registry?.group_ids ?? project.group_ids, registry?.groups ?? project.groups)
    const lines = [
      "<project-context>",
      `Current project: ${project.name ?? project.worktree}`,
      `Project directory: ${project.worktree}`,
      `Project groups: ${projectGroups.join(", ")}`,
    ]

    if (registry?.description) lines.push(`Project description: ${registry.description}`)
    if (registry?.profile_markdown) lines.push("Project profile markdown is available via the profile tool.")

    if (workspace) {
      const selectedGroups = await names(workspace.selected_group_ids, workspace.selected_groups)
      const projects = await workspaceProjects()
      lines.push(`Workspace: ${workspace.name}`)
      if (selectedGroups[0] !== "未分组" || workspace.selected_group_ids.length > 0 || workspace.selected_groups.length > 0) {
        lines.push(`Selected groups: ${selectedGroups.join(", ")}`)
      }
      lines.push(
        `Workspace projects: ${projects.map((item) => `${item.name ?? item.directory} [${item.groups.join(", ")}]`).join("; ")}`,
      )
    }

    lines.push("Use the profile tool whenever you need the detailed markdown background for a project, group, or workspace.")
    lines.push("</project-context>")
    return lines.join("\n")
  }

  export async function workspace() {
    const workspace = Instance.workspace
    const registry = await currentProjectRegistry()
    if (!workspace) {
      return project()
    }
    const selectedGroups = await groupItems(workspace.selected_group_ids)
    const projectProfiles = await workspaceProjects()
    const primary = projectProfiles.find((item) => item.projectID === workspace.primaryProjectID)
    const selected = await names(workspace.selected_group_ids, workspace.selected_groups)

    return [
      `# Workspace`,
      `- Name: ${workspace.name}`,
      `- Primary project: ${primary?.name ?? workspace.primaryProjectID}`,
      `- Selected groups: ${selected.join(", ")}`,
      "",
      selectedGroups.length > 0
        ? [
            "## Group Profiles",
            ...selectedGroups.flatMap((group) => [
              `### ${group.name}`,
              ...(group.description ? [group.description, ""] : []),
              ...(group.profile_markdown ? [group.profile_markdown, ""] : []),
            ]),
          ].join("\n")
        : "## Group Profiles\nNo explicit groups were selected for this workspace.",
      "",
      [
        "## Project Profiles",
        ...projectProfiles.flatMap((item) => [
          `### ${item.name ?? item.directory}`,
          `Groups: ${item.groups.join(", ")}`,
          ...(item.description ? [item.description] : []),
          ...(item.profile_markdown ? ["", item.profile_markdown] : []),
          "",
        ]),
      ].join("\n"),
      ...(registry?.profile_markdown ? ["", "## Current Project Profile", registry.profile_markdown] : []),
    ]
      .filter(Boolean)
      .join("\n")
  }

  export async function project(projectID?: string) {
    const target = projectID ? await ProjectRegistry.findByProjectID(projectID) : await currentProjectRegistry()
    const item = target ?? {
      name: Instance.project.name,
      directory: Instance.project.worktree,
      description: Instance.project.description,
      groups: Instance.project.groups,
      group_ids: Instance.project.group_ids,
      profile_markdown: Instance.project.profile_markdown,
    }
    const groups = await names(item.group_ids, item.groups)
    return [
      `# Project`,
      `- Name: ${item.name ?? item.directory}`,
      `- Directory: ${item.directory}`,
      `- Groups: ${groups.join(", ")}`,
      ...(item.description ? ["", item.description] : []),
      ...(item.profile_markdown ? ["", "## Project Profile", item.profile_markdown] : []),
    ].join("\n")
  }

  export async function group(groupID?: string) {
    const workspace = Instance.workspace
    const fallback = workspace?.selected_group_ids[0] ?? Instance.project.group_ids[0]
    const id = groupID ?? fallback
    if (!id) {
      return "# Group\nNo explicit group is associated with the current context."
    }
    const group = await GroupRegistry.get(id)
    return [
      `# Group`,
      `- Name: ${group.name}`,
      `- Slug: ${group.slug}`,
      ...(group.description ? ["", group.description] : []),
      ...(group.profile_markdown ? ["", "## Group Profile", group.profile_markdown] : []),
    ].join("\n")
  }
}
