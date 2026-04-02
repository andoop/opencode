import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Branch } from "../../branch"
import { lazy } from "../../util/lazy"

const result = z.object({
  local: z.array(z.string()),
  remote: z.array(z.string()),
  current: z.string().optional(),
})

export const BranchRoutes = lazy(() =>
  new Hono()
    .get(
      "/list",
      describeRoute({
        summary: "List branches",
        description: "Get local and remote branches for a git directory.",
        operationId: "branch.list",
        responses: {
          200: {
            description: "Branch list",
            content: {
              "application/json": {
                schema: resolver(result),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          directory: z.string().meta({ description: "Git directory path" }),
        }),
      ),
      async (c) => {
        const dir = c.req.valid("query").directory
        return c.json(await Branch.list(dir))
      },
    )
    .post(
      "/refresh",
      describeRoute({
        summary: "Refresh branches",
        description: "Run git fetch and return updated branch list.",
        operationId: "branch.refresh",
        responses: {
          200: {
            description: "Updated branch list",
            content: {
              "application/json": {
                schema: resolver(result),
              },
            },
          },
        },
      }),
      validator(
        "json",
        z.object({
          directory: z.string().meta({ description: "Git directory path" }),
        }),
      ),
      async (c) => {
        const dir = c.req.valid("json").directory
        return c.json(await Branch.refresh(dir))
      },
    ),
)
