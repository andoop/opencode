import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import { StorageAdmin } from "@/storage/admin"
import { User } from "@/user"
import { errors } from "../error"

function requireAdmin() {
  return async (c: any, next: any) => {
    const user = User.current()
    if (!user || user.role !== "admin") {
      return c.json({ error: "Admin access required" }, 403)
    }
    return next()
  }
}

export function StorageRoutes() {
  return new Hono()
    .use("/admin/*", requireAdmin())
    .get(
      "/admin/summary",
      describeRoute({
        summary: "Get storage admin summary",
        description: "Inspect reclaimable runtime storage grouped by cleanup category.",
        operationId: "storage.admin.summary",
        responses: {
          200: {
            description: "Storage summary",
            content: {
              "application/json": {
                schema: resolver(StorageAdmin.Summary),
              },
            },
          },
          ...errors(403),
        },
      }),
      async (c) => {
        return c.json(await StorageAdmin.summary())
      },
    )
    .post(
      "/admin/summary",
      describeRoute({
        summary: "Get storage admin summary",
        description: "Inspect reclaimable runtime storage with client-provided active workspace state.",
        operationId: "storage.admin.summary.withState",
        responses: {
          200: {
            description: "Storage summary",
            content: {
              "application/json": {
                schema: resolver(StorageAdmin.Summary),
              },
            },
          },
          ...errors(400, 403),
        },
      }),
      validator("json", StorageAdmin.ScanInput),
      async (c) => {
        return c.json(await StorageAdmin.summary(c.req.valid("json")))
      },
    )
    .post(
      "/admin/plan",
      describeRoute({
        summary: "Plan storage cleanup",
        description: "Preview storage objects that would be removed for selected categories.",
        operationId: "storage.admin.plan",
        responses: {
          200: {
            description: "Cleanup plan",
            content: {
              "application/json": {
                schema: resolver(StorageAdmin.Plan),
              },
            },
          },
          ...errors(400, 403),
        },
      }),
      validator("json", StorageAdmin.PlanInput),
      async (c) => {
        return c.json(await StorageAdmin.plan(c.req.valid("json")))
      },
    )
    .post(
      "/admin/cleanup",
      describeRoute({
        summary: "Run storage cleanup",
        description: "Remove selected storage objects, optionally forcing high-risk cleanup.",
        operationId: "storage.admin.cleanup",
        responses: {
          200: {
            description: "Cleanup result",
            content: {
              "application/json": {
                schema: resolver(StorageAdmin.CleanupResult),
              },
            },
          },
          ...errors(400, 403),
        },
      }),
      validator("json", StorageAdmin.PlanInput),
      async (c) => {
        return c.json(await StorageAdmin.cleanup(c.req.valid("json")))
      },
    )
}
