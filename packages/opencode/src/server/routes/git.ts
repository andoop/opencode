import { Git } from "@/git"
import { Project } from "@/project/project"
import { Workspace } from "@/workspace"
import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { lazy } from "../../util/lazy"

async function assertDirectory(directory: string) {
  const workspace = await Workspace.fromDirectory(directory)
  if (workspace) return
  await Project.assertDirectoryAccess(directory)
}

export const GitRoutes = lazy(() =>
  new Hono()
    .get(
      "/history",
      describeRoute({
        summary: "Get git history",
        description: "Get a paginated git history view for all visible refs in a directory.",
        operationId: "git.history",
        responses: {
          200: {
            description: "Git history page",
            content: {
              "application/json": {
                schema: resolver(Git.HistoryPage),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          directory: z.string().meta({ description: "Git directory path" }),
          limit: z.coerce.number().int().min(1).max(500).optional(),
          cursor: z.string().optional(),
        }),
      ),
      async (c) => {
        const query = c.req.valid("query")
        await assertDirectory(query.directory)
        return c.json(await Git.history(query))
      },
    )
    .get(
      "/commit",
      describeRoute({
        summary: "Get git commit detail",
        description: "Get commit metadata and full file diffs for a commit in a directory.",
        operationId: "git.commit",
        responses: {
          200: {
            description: "Git commit detail",
            content: {
              "application/json": {
                schema: resolver(Git.CommitDetail),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          directory: z.string().meta({ description: "Git directory path" }),
          oid: z.string().meta({ description: "Commit object id" }),
        }),
      ),
      async (c) => {
        const query = c.req.valid("query")
        await assertDirectory(query.directory)
        return c.json(await Git.commit(query))
      },
    ),
)
