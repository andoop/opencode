import { Hono } from "hono"
import { describeRoute, validator } from "hono-openapi"
import { resolver } from "hono-openapi"
import { Project } from "../../project/project"
import { GroupRegistry } from "../../project/group-registry"
import { ProjectRegistry } from "../../project/registry"
import z from "zod"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { User } from "../../user"
import { Workspace } from "@/workspace"

function decode(input: string) {
  try {
    return decodeURIComponent(input)
  } catch {
    return input
  }
}

function requireAdmin() {
  return async (c: any, next: any) => {
    const user = User.current()
    if (!user || user.role !== "admin") {
      return c.json({ error: "Admin access required" }, 403)
    }
    return next()
  }
}

export const ProjectRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List all projects",
        description: "Get a list of projects that have been opened with OpenCode.",
        operationId: "project.list",
        responses: {
          200: {
            description: "List of projects",
            content: {
              "application/json": {
                schema: resolver(Project.Info.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        const projects = await Project.list()
        return c.json(projects)
      },
    )
    .get(
      "/group",
      describeRoute({
        summary: "List project groups",
        description: "List groups used to organize projects.",
        operationId: "project.group.list",
        responses: {
          200: {
            description: "Project groups",
            content: {
              "application/json": {
                schema: resolver(GroupRegistry.Info.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        const user = User.current()
        const all = await GroupRegistry.list()
        if (user?.role === "admin") return c.json(all)
        const visible = await ProjectRegistry.list()
        const groupIDs = new Set(
          visible
            .filter((item) => ProjectRegistry.visibleTo(item, { userID: user?.id, role: user?.role }))
            .flatMap((item) => item.group_ids),
        )
        return c.json(all.filter((item) => groupIDs.has(item.id)))
      },
    )
    .post(
      "/group",
      describeRoute({
        summary: "Create project group",
        description: "Create a group used to organize projects.",
        operationId: "project.group.create",
        responses: {
          200: {
            description: "Created project group",
            content: {
              "application/json": {
                schema: resolver(GroupRegistry.Info),
              },
            },
          },
          ...errors(400, 403),
        },
      }),
      requireAdmin(),
      validator(
        "json",
        z.object({
          name: z.string(),
          description: z.string().optional(),
          profile_markdown: z.string().optional(),
        }),
      ),
      async (c) => {
        const body = c.req.valid("json")
        const user = User.current()
        return c.json(
          await GroupRegistry.add({
            ...body,
            created_by: user?.id,
          }),
        )
      },
    )
    .patch(
      "/group/:id",
      describeRoute({
        summary: "Update project group",
        description: "Update a project group.",
        operationId: "project.group.update",
        responses: {
          200: {
            description: "Updated project group",
            content: {
              "application/json": {
                schema: resolver(GroupRegistry.Info),
              },
            },
          },
          ...errors(400, 403, 404),
        },
      }),
      requireAdmin(),
      validator("param", z.object({ id: z.string() })),
      validator(
        "json",
        z.object({
          name: z.string().optional(),
          description: z.string().optional(),
          profile_markdown: z.string().optional(),
        }),
      ),
      async (c) => {
        const { id } = c.req.valid("param")
        const body = c.req.valid("json")
        return c.json(
          await GroupRegistry.update(id, (draft) => {
            if (body.name !== undefined) draft.name = body.name
            if (body.description !== undefined) draft.description = body.description
            if (body.profile_markdown !== undefined) draft.profile_markdown = body.profile_markdown
          }),
        )
      },
    )
    .delete(
      "/group/:id",
      describeRoute({
        summary: "Delete project group",
        description: "Delete a project group.",
        operationId: "project.group.delete",
        responses: {
          200: {
            description: "Deleted project group",
            content: {
              "application/json": {
                schema: resolver(z.object({ success: z.boolean() })),
              },
            },
          },
          ...errors(403, 404),
        },
      }),
      requireAdmin(),
      validator("param", z.object({ id: z.string() })),
      async (c) => {
        const { id } = c.req.valid("param")
        const group = await GroupRegistry.get(id)
        await GroupRegistry.remove(id)
        await Promise.all(
          (await ProjectRegistry.list())
            .filter((item) => item.group_ids.includes(id))
            .map((item) =>
              ProjectRegistry.update(item.id, (draft) => {
                draft.group_ids = draft.group_ids.filter((groupID) => groupID !== id)
                draft.groups = draft.groups.filter((value) => value !== group.name)
              }),
            ),
        )
        return c.json({ success: true })
      },
    )
    .get(
      "/registry",
      describeRoute({
        summary: "List registered projects",
        description: "Get the admin-managed project registry.",
        operationId: "project.registry.list",
        responses: {
          200: {
            description: "Registered projects",
            content: {
              "application/json": {
                schema: resolver(ProjectRegistry.Info.array()),
              },
            },
          },
          ...errors(403),
        },
      }),
      requireAdmin(),
      async (c) => {
        return c.json(await ProjectRegistry.list())
      },
    )
    .post(
      "/registry",
      describeRoute({
        summary: "Register project",
        description: "Add a local project directory to the admin registry.",
        operationId: "project.registry.create",
        responses: {
          200: {
            description: "Registered project",
            content: {
              "application/json": {
                schema: resolver(ProjectRegistry.Info),
              },
            },
          },
          ...errors(400, 403),
        },
      }),
      requireAdmin(),
      validator(
        "json",
        z.object({
          directory: z.string(),
          name: z.string().optional(),
          description: z.string().optional(),
          profile_markdown: z.string().optional(),
          group_ids: z.array(z.string()).optional(),
          visibility: z
            .object({
              mode: z.enum(["all", "include", "exclude"]).optional(),
              user_ids: z.array(z.string()).optional(),
            })
            .optional(),
        }),
      ),
      async (c) => {
        const body = c.req.valid("json")
        const user = User.current()
        const groups = body.group_ids ? await GroupRegistry.names(body.group_ids) : undefined
        const project = await ProjectRegistry.add({
          ...body,
          groups,
          created_by: user?.id,
        })
        return c.json(project)
      },
    )
    .patch(
      "/registry/:id",
      describeRoute({
        summary: "Update registered project",
        description: "Update an admin-managed project registry entry.",
        operationId: "project.registry.update",
        responses: {
          200: {
            description: "Updated registered project",
            content: {
              "application/json": {
                schema: resolver(ProjectRegistry.Info),
              },
            },
          },
          ...errors(400, 403, 404),
        },
      }),
      requireAdmin(),
      validator("param", z.object({ id: z.string() })),
      validator(
        "json",
        z.object({
          name: z.string().optional(),
          description: z.string().optional(),
          profile_markdown: z.string().optional(),
          group_ids: z.array(z.string()).optional(),
          visibility: z
            .object({
              mode: z.enum(["all", "include", "exclude"]).optional(),
              user_ids: z.array(z.string()).optional(),
            })
            .optional(),
        }),
      ),
      async (c) => {
        const { id } = c.req.valid("param")
        const body = c.req.valid("json")
        const groups = body.group_ids ? await GroupRegistry.names(body.group_ids) : undefined
        const project = await ProjectRegistry.update(id, (draft) => {
          if (body.name !== undefined) draft.name = body.name
          if (body.description !== undefined) draft.description = body.description
          if (body.profile_markdown !== undefined) draft.profile_markdown = body.profile_markdown
          if (body.group_ids !== undefined) {
            draft.group_ids = body.group_ids
            draft.groups = groups ?? []
          }
          if (body.visibility !== undefined) {
            draft.visibility = {
              ...draft.visibility,
              ...body.visibility,
            }
          }
        })
        return c.json(project)
      },
    )
    .delete(
      "/registry/:id",
      describeRoute({
        summary: "Delete registered project",
        description: "Remove a project from the admin registry.",
        operationId: "project.registry.delete",
        responses: {
          200: {
            description: "Deleted registered project",
            content: {
              "application/json": {
                schema: resolver(z.object({ success: z.boolean() })),
              },
            },
          },
          ...errors(403, 404),
        },
      }),
      requireAdmin(),
      validator("param", z.object({ id: z.string() })),
      async (c) => {
        await ProjectRegistry.remove(c.req.valid("param").id)
        return c.json({ success: true })
      },
    )
    .get(
      "/current",
      describeRoute({
        summary: "Get current project",
        description: "Retrieve the currently active project that OpenCode is working with.",
        operationId: "project.current",
        responses: {
          200: {
            description: "Current project information",
            content: {
              "application/json": {
                schema: resolver(Project.Info),
              },
            },
          },
        },
      }),
      async (c) => {
        const raw = c.req.query("directory") || c.req.header("x-opencode-directory") || process.cwd()
        const directory = decode(raw)
        const workspace = await Workspace.fromDirectory(directory)
        if (workspace) {
          return c.json(Workspace.asProject(workspace.workspace))
        }
        const result = await Project.fromDirectory(directory)
        return c.json(result.project)
      },
    )
    .patch(
      "/:projectID",
      describeRoute({
        summary: "Update project",
        description: "Update project properties such as name, icon, and commands.",
        operationId: "project.update",
        responses: {
          200: {
            description: "Updated project information",
            content: {
              "application/json": {
                schema: resolver(Project.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ projectID: z.string() })),
      validator("json", Project.update.schema.omit({ projectID: true })),
      async (c) => {
        const projectID = c.req.valid("param").projectID
        const body = c.req.valid("json")
        const project = await Project.update({ ...body, projectID })
        return c.json(project)
      },
    ),
)
