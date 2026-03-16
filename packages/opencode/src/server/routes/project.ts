import { Hono } from "hono"
import { describeRoute, validator } from "hono-openapi"
import { resolver } from "hono-openapi"
import { Instance } from "../../project/instance"
import { Project } from "../../project/project"
import { ProjectRegistry } from "../../project/registry"
import z from "zod"
import { errors } from "../error"
import { lazy } from "../../util/lazy"
import { User } from "../../user"

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
        }),
      ),
      async (c) => {
        const body = c.req.valid("json")
        const user = User.current()
        const project = await ProjectRegistry.add({
          ...body,
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
        }),
      ),
      async (c) => {
        const { id } = c.req.valid("param")
        const body = c.req.valid("json")
        const project = await ProjectRegistry.update(id, (draft) => {
          if (body.name !== undefined) draft.name = body.name
          if (body.description !== undefined) draft.description = body.description
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
        return c.json(Instance.project)
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
