import type { Project } from "@opencode-ai/sdk/v2/client"

export type WorkspaceProject = {
  projectID: string
  slug: string
  sourceDirectory: string
  name?: string
  description?: string
  primary?: boolean
  vcs?: "git"
}

export type WorkspaceInfo = {
  id: string
  name: string
  directory: string
  userID?: string
  primaryProjectID: string
  projects: WorkspaceProject[]
  time: {
    created: number
    updated: number
  }
}

export function workspaceAsProject(workspace: WorkspaceInfo): Project {
  return {
    id: workspace.id,
    worktree: workspace.directory,
    name: workspace.name,
    description: workspace.projects.map((item) => item.name).filter(Boolean).join(", ") || undefined,
    sandboxes: [],
    vcs: "git",
    time: workspace.time,
  }
}

export async function workspaceFetch<T>(
  baseUrl: string,
  pathname: string,
  init?: RequestInit & { token?: string; fetchFn?: typeof fetch },
) {
  const url = new URL(pathname, baseUrl)
  const headers = new Headers(init?.headers)
  if (init?.token) headers.set("Authorization", `Bearer ${init.token}`)
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  const res = await (init?.fetchFn ?? fetch)(url, {
    ...init,
    headers,
  })
  if (!res.ok) {
    throw new Error(await res.text())
  }
  return (await res.json()) as T
}
