import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Command } from "../../command"
import { Config } from "../../config/config"
import { errors } from "../error"
import { lazy } from "../../util/lazy"

const CommandConfigInput = z.object({
  template: z.string().min(1),
  description: z.string().optional(),
  agent: z.string().optional(),
  model: z.string().optional(),
  subtask: z.boolean().optional(),
})

const CommandConfigList = z.object({
  path: z.string(),
  command: z.record(z.string(), CommandConfigInput),
  commands: Config.Commands.default({}),
})

export const CommandRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List commands",
        description: "Get a list of all available commands in the OpenCode system.",
        operationId: "command.list",
        responses: {
          200: {
            description: "List of commands",
            content: {
              "application/json": {
                schema: resolver(Command.Info.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        const commands = await Command.list()
        return c.json(commands)
      },
    )
    .get(
      "/config",
      describeRoute({
        summary: "List command config",
        description: "List persisted global command configuration.",
        operationId: "command.config.list",
        responses: {
          200: {
            description: "Persisted command configuration",
            content: {
              "application/json": {
                schema: resolver(CommandConfigList),
              },
            },
          },
        },
      }),
      async (c) => {
        const commandConfig = await Config.getCommand()
        const globalConfig = await Config.getGlobal()
        return c.json({
          ...commandConfig,
          commands: globalConfig.commands ?? {},
        })
      },
    )
    .post(
      "/config",
      describeRoute({
        summary: "Create command config",
        description: "Create a new global command configuration.",
        operationId: "command.config.create",
        responses: {
          200: {
            description: "Persisted command configuration",
            content: {
              "application/json": {
                schema: resolver(CommandConfigList),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator(
        "json",
        z.object({
          name: z.string().min(1),
          config: CommandConfigInput,
        }),
      ),
      async (c) => {
        const body = c.req.valid("json")
        const current = await Config.getCommand()
        if (current.command[body.name]) {
          return c.json({ error: `Command ${body.name} already exists` }, 400)
        }
        return c.json(await Config.upsertCommand(body.name, body.config))
      },
    )
    .patch(
      "/config/:name",
      describeRoute({
        summary: "Update command config",
        description: "Update an existing global command configuration.",
        operationId: "command.config.update",
        responses: {
          200: {
            description: "Persisted command configuration",
            content: {
              "application/json": {
                schema: resolver(CommandConfigList),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ name: z.string() })),
      validator(
        "json",
        z.object({
          config: CommandConfigInput.partial(),
        }),
      ),
      async (c) => {
        const name = c.req.valid("param").name
        const current = await Config.getCommand()
        const entry = current.command[name]
        if (!entry) {
          return c.json({ error: `Command ${name} not found` }, 404)
        }
        return c.json(await Config.upsertCommand(name, { ...entry, ...c.req.valid("json").config }))
      },
    )
    .delete(
      "/config/:name",
      describeRoute({
        summary: "Delete command config",
        description: "Delete a global command configuration.",
        operationId: "command.config.delete",
        responses: {
          200: {
            description: "Persisted command configuration",
            content: {
              "application/json": {
                schema: resolver(CommandConfigList),
              },
            },
          },
          ...errors(404),
        },
      }),
      validator("param", z.object({ name: z.string() })),
      async (c) => {
        const name = c.req.valid("param").name
        const current = await Config.getCommand()
        if (!current.command[name]) {
          return c.json({ error: `Command ${name} not found` }, 404)
        }
        return c.json(await Config.removeCommand(name))
      },
    ),
)
