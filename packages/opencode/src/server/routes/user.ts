import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { User } from "@/user"
import { Identifier } from "@/id/id"
import { errors } from "../error"

// Admin-only middleware
function requireAdmin() {
  return async (c: any, next: any) => {
    const user = User.current()
    if (!user || user.role !== "admin") {
      return c.json({ error: "Admin access required" }, 403)
    }
    return next()
  }
}

export function UserRoutes() {
  return new Hono()
    .use(requireAdmin())
    .get(
      "/",
      describeRoute({
        summary: "List users",
        description: "Get a list of all users (admin only)",
        operationId: "user.list",
        responses: {
          200: {
            description: "List of users",
            content: {
              "application/json": {
                schema: resolver(User.PublicInfo.array()),
              },
            },
          },
          ...errors(403),
        },
      }),
      async (c) => {
        const users = await User.list()
        return c.json(users)
      },
    )
    .post(
      "/",
      describeRoute({
        summary: "Create user",
        description: "Create a new user (admin only)",
        operationId: "user.create",
        responses: {
          200: {
            description: "User created",
            content: {
              "application/json": {
                schema: resolver(User.PublicInfo),
              },
            },
          },
          ...errors(400, 403),
        },
      }),
      validator(
        "json",
        z.object({
          username: z.string().min(3).max(50),
          password: z.string().min(6),
          email: z.string().email().optional(),
          role: User.Role.optional(),
          permission: User.Permission.optional(),
        }),
      ),
      async (c) => {
        const input = c.req.valid("json")
        const user = await User.create(input)
        return c.json(user)
      },
    )
    .get(
      "/:userID",
      describeRoute({
        summary: "Get user",
        description: "Get user by ID (admin only)",
        operationId: "user.get",
        responses: {
          200: {
            description: "User info",
            content: {
              "application/json": {
                schema: resolver(User.PublicInfo),
              },
            },
          },
          ...errors(403, 404),
        },
      }),
      validator(
        "param",
        z.object({
          userID: Identifier.schema("user"),
        }),
      ),
      async (c) => {
        const { userID } = c.req.valid("param")
        const user = await User.get(userID)
        return c.json(user)
      },
    )
    .patch(
      "/:userID",
      describeRoute({
        summary: "Update user",
        description: "Update user by ID (admin only)",
        operationId: "user.update",
        responses: {
          200: {
            description: "User updated",
            content: {
              "application/json": {
                schema: resolver(User.PublicInfo),
              },
            },
          },
          ...errors(400, 403, 404),
        },
      }),
      validator(
        "param",
        z.object({
          userID: Identifier.schema("user"),
        }),
      ),
      validator(
        "json",
        z.object({
          username: z.string().min(3).max(50).optional(),
          email: z.string().email().optional(),
          role: User.Role.optional(),
          status: User.Status.optional(),
          permission: User.Permission.optional(),
        }),
      ),
      async (c) => {
        const { userID } = c.req.valid("param")
        const updates = c.req.valid("json")

        const user = await User.update(userID, (draft) => {
          if (updates.username) draft.username = updates.username
          if (updates.email !== undefined) draft.email = updates.email
          if (updates.role) draft.role = updates.role
          if (updates.status) draft.status = updates.status
          if (updates.permission) draft.permission = updates.permission
        })

        return c.json(user)
      },
    )
    .post(
      "/:userID/reset-password",
      describeRoute({
        summary: "Reset user password",
        description: "Reset a user's password (admin only)",
        operationId: "user.resetPassword",
        responses: {
          200: {
            description: "Password reset",
            content: {
              "application/json": {
                schema: resolver(z.object({ success: z.boolean() })),
              },
            },
          },
          ...errors(400, 403, 404),
        },
      }),
      validator(
        "param",
        z.object({
          userID: Identifier.schema("user"),
        }),
      ),
      validator(
        "json",
        z.object({
          new_password: z.string().min(6),
        }),
      ),
      async (c) => {
        const { userID } = c.req.valid("param")
        const { new_password } = c.req.valid("json")

        await User.updatePassword(userID, new_password)
        return c.json({ success: true })
      },
    )
    .delete(
      "/:userID",
      describeRoute({
        summary: "Delete user",
        description: "Delete user by ID (admin only)",
        operationId: "user.delete",
        responses: {
          200: {
            description: "User deleted",
            content: {
              "application/json": {
                schema: resolver(z.object({ success: z.boolean() })),
              },
            },
          },
          ...errors(403, 404),
        },
      }),
      validator(
        "param",
        z.object({
          userID: Identifier.schema("user"),
        }),
      ),
      async (c) => {
        const { userID } = c.req.valid("param")

        // Prevent self-deletion
        const currentUser = User.current()
        if (currentUser?.id === userID) {
          return c.json({ error: "Cannot delete your own account" }, 400)
        }

        await User.remove(userID)
        return c.json({ success: true })
      },
    )
}
