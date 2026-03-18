import { describeRoute, resolver, validator } from "hono-openapi"
import { Hono } from "hono"
import z from "zod"
import { File } from "../../file"
import { Project } from "../../project/project"
import { lazy } from "../../util/lazy"
import { User } from "@/user"
import { Log } from "@/util/log"

function decode(input: string) {
  try {
    return decodeURIComponent(input)
  } catch {
    return input
  }
}

const log = Log.create({ service: "server.browse" })

export const BrowseRoutes = lazy(() =>
  new Hono()
    .use(async (_, next) => {
      User.requireFeature("files")
      return next()
    })
    .get(
      "/file",
      describeRoute({
        summary: "Browse files",
        description: "Browse files and directories without initializing a project instance.",
        operationId: "browse.list",
        responses: {
          200: {
            description: "Files and directories",
            content: {
              "application/json": {
                schema: resolver(File.Node.array()),
              },
            },
          },
        },
      }),
      validator(
        "query",
        z.object({
          directory: z.string(),
          path: z.string(),
          type: z.enum(["file", "directory"]).optional(),
          limit: z.coerce.number().int().min(1).max(1000).optional(),
        }),
      ),
      async (c) => {
        const input = c.req.valid("query")
        const directory = decode(input.directory)
        using _ = log.time("list", input)
        await Project.assertDirectoryAccess(directory)
        const content = await File.browse({
          directory,
          path: input.path,
          type: input.type,
          limit: input.limit,
        })
        log.info("list.result", {
          directory,
          path: input.path,
          type: input.type,
          limit: input.limit,
          count: content.length,
        })
        return c.json(content)
      },
    ),
)
