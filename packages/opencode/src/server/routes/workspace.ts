import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { Workspace } from "@/workspace"
import { Project } from "@/project/project"
import { errors } from "../error"
import { lazy } from "@/util/lazy"
import { User } from "@/user"

function requireAdmin() {
  return async (c: any, next: any) => {
    const user = User.current()
    if (!user || user.role !== "admin") {
      return c.json({ error: "Admin access required" }, 403)
    }
    return next()
  }
}

export const WorkspaceRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List workspaces",
        operationId: "workspace.list",
        responses: {
          200: {
            description: "Workspace list",
            content: {
              "application/json": {
                schema: resolver(Workspace.Info.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        return c.json(await Workspace.list())
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Create workspace",
        operationId: "workspace.create",
        responses: {
          200: {
            description: "Created workspace",
            content: {
              "application/json": {
                schema: resolver(Workspace.Info),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", Workspace.CreateInput),
      async (c) => {
        return c.json(await Workspace.create(c.req.valid("json")))
      },
    )
    .get(
      "/available-projects",
      describeRoute({
        summary: "List available projects",
        operationId: "workspace.availableProjects",
        responses: {
          200: {
            description: "Available projects",
            content: {
              "application/json": {
                schema: resolver(Project.Info.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        const result = await Workspace.availableProjects()
        return c.json(result)
      },
    )
    .get(
      "/:workspaceID",
      describeRoute({
        summary: "Get workspace",
        operationId: "workspace.get",
        responses: {
          200: {
            description: "Workspace",
            content: {
              "application/json": {
                schema: resolver(Workspace.Info),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ workspaceID: z.string() })),
      async (c) => {
        return c.json(await Workspace.read(c.req.valid("param").workspaceID))
      },
    )
    .patch(
      "/:workspaceID/projects",
      describeRoute({
        summary: "Update workspace projects",
        operationId: "workspace.updateProjects",
        responses: {
          200: {
            description: "Updated workspace",
            content: {
              "application/json": {
                schema: resolver(Workspace.Info),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator("param", z.object({ workspaceID: z.string() })),
      validator(
        "json",
        z.object({
          directories: z.array(z.string()).min(1),
          primaryProjectID: z.string().optional(),
        }),
      ),
      async (c) => {
        const { workspaceID } = c.req.valid("param")
        const body = c.req.valid("json")
        return c.json(await Workspace.updateProjects(workspaceID, body.directories, body.primaryProjectID))
      },
    )
    .delete(
      "/:workspaceID",
      describeRoute({
        summary: "Delete workspace",
        operationId: "workspace.delete",
        responses: {
          200: {
            description: "Deleted workspace",
            content: {
              "application/json": {
                schema: resolver(z.object({ success: z.boolean() })),
              },
            },
          },
        },
      }),
      validator("param", z.object({ workspaceID: z.string() })),
      async (c) => {
        await Workspace.remove(c.req.valid("param").workspaceID)
        return c.json({ success: true })
      },
    )
    .post(
      "/reset",
      describeRoute({
        summary: "Reset all runtime data",
        operationId: "workspace.resetData",
        responses: {
          200: {
            description: "Reset complete",
            content: {
              "application/json": {
                schema: resolver(z.object({ success: z.boolean() })),
              },
            },
          },
        },
      }),
      requireAdmin(),
      async (c) => {
        return c.json({ success: true })
      },
    ),
)
