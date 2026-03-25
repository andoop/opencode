import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { Select } from "../../select"
import { errors } from "../error"
import { lazy } from "../../util/lazy"

export const SelectRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List pending selections",
        description: "Get all pending select requests across all sessions.",
        operationId: "select.list",
        responses: {
          200: {
            description: "List of pending select requests",
            content: {
              "application/json": {
                schema: resolver(Select.Request.array()),
              },
            },
          },
        },
      }),
      async (c) => {
        const pending = await Select.list()
        return c.json(pending)
      },
    )
    .post(
      "/:requestID/reply",
      describeRoute({
        summary: "Reply to select request",
        description: "Provide the selected value to a select request from the AI assistant.",
        operationId: "select.reply",
        responses: {
          200: {
            description: "Selection submitted successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          requestID: z.string(),
        }),
      ),
      validator("json", Select.Reply),
      async (c) => {
        const params = c.req.valid("param")
        const json = c.req.valid("json")
        await Select.reply({
          requestID: params.requestID,
          value: json.value,
          source: json.source,
        })
        return c.json(true)
      },
    )
    .post(
      "/:requestID/reject",
      describeRoute({
        summary: "Reject select request",
        description: "Reject a select request from the AI assistant.",
        operationId: "select.reject",
        responses: {
          200: {
            description: "Selection rejected successfully",
            content: {
              "application/json": {
                schema: resolver(z.boolean()),
              },
            },
          },
          ...errors(400, 404),
        },
      }),
      validator(
        "param",
        z.object({
          requestID: z.string(),
        }),
      ),
      async (c) => {
        const params = c.req.valid("param")
        await Select.reject(params.requestID)
        return c.json(true)
      },
    ),
)
