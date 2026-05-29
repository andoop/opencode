import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { DataRoot } from "@/global/root"
import { lazy } from "@/util/lazy"

const Status = z
  .object({
    configured: z.boolean(),
    root: z.string(),
    source: z.enum(["env", "pointer", "setup"]),
    pointer: z.string(),
    layout: z.number(),
    marker: z.string(),
    needsSetup: z.boolean(),
  })
  .meta({ ref: "DataRootStatus" })

const Validation = z
  .object({
    ok: z.boolean(),
    root: z.string(),
    exists: z.boolean(),
    initialized: z.boolean(),
    reason: z.string().optional(),
  })
  .meta({ ref: "DataRootValidation" })

const Input = z.object({
  path: z.string(),
})

export const DataRootRoutes = lazy(() =>
  new Hono()
    .get(
      "/status",
      describeRoute({
        summary: "Get portable data root status",
        operationId: "dataRoot.status",
        responses: {
          200: {
            description: "Portable data root status",
            content: {
              "application/json": {
                schema: resolver(Status),
              },
            },
          },
        },
      }),
      async (c) => {
        const state = DataRoot.current()
        return c.json({
          configured: state.configured,
          root: state.root,
          source: state.source,
          pointer: DataRoot.pointerFile(),
          layout: DataRoot.Manifest.version,
          marker: DataRoot.Manifest.marker,
          needsSetup: !state.configured,
        } satisfies z.infer<typeof Status>)
      },
    )
    .post(
      "/validate",
      describeRoute({
        summary: "Validate portable data root",
        operationId: "dataRoot.validate",
        responses: {
          200: {
            description: "Validation result",
            content: {
              "application/json": {
                schema: resolver(Validation),
              },
            },
          },
        },
      }),
      validator("json", Input),
      async (c) => {
        return c.json(await DataRoot.validate(c.req.valid("json").path))
      },
    )
    .post(
      "/bind",
      describeRoute({
        summary: "Bind portable data root",
        operationId: "dataRoot.bind",
        responses: {
          200: {
            description: "Bound portable data root",
            content: {
              "application/json": {
                schema: resolver(
                  Status.extend({
                    restartRequired: z.boolean(),
                  }).meta({ ref: "DataRootBindResult" }),
                ),
              },
            },
          },
        },
      }),
      validator("json", Input),
      async (c) => {
        const state = await DataRoot.bind(c.req.valid("json").path)
        return c.json({
          configured: state.configured,
          root: state.root,
          source: state.source,
          pointer: DataRoot.pointerFile(),
          layout: DataRoot.Manifest.version,
          marker: DataRoot.Manifest.marker,
          needsSetup: false,
          restartRequired: false,
        })
      },
    ),
)
