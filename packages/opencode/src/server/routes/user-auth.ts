import { Hono } from "hono"
import { describeRoute, resolver, validator } from "hono-openapi"
import z from "zod"
import { User } from "@/user"
import { UserAuth } from "@/user/auth"
import { errors } from "../error"

export function UserAuthRoutes() {
  return new Hono()
    .post(
      "/login",
      describeRoute({
        summary: "User login",
        description: "Authenticate user and return JWT token",
        operationId: "userAuth.login",
        responses: {
          200: {
            description: "Login successful",
            content: {
              "application/json": {
                schema: resolver(UserAuth.LoginResponse),
              },
            },
          },
          ...errors(400, 401),
        },
      }),
      validator(
        "json",
        z.object({
          username: z.string().min(1),
          password: z.string().min(1),
        }),
      ),
      async (c) => {
        const { username, password } = c.req.valid("json")
        const result = await UserAuth.login(username, password)
        return c.json(result)
      },
    )
    .post(
      "/refresh",
      describeRoute({
        summary: "Refresh token",
        description: "Get a new JWT token using existing token",
        operationId: "userAuth.refresh",
        responses: {
          200: {
            description: "Token refreshed",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({ token: z.string() }).meta({ ref: "RefreshResponse" }),
                ),
              },
            },
          },
          ...errors(401),
        },
      }),
      async (c) => {
        const authHeader = c.req.header("Authorization")
        if (!authHeader?.startsWith("Bearer ")) {
          return c.json({ error: "No token provided" }, 401)
        }

        const token = authHeader.slice(7)
        const newToken = await UserAuth.refresh(token)
        if (!newToken) {
          return c.json({ error: "Invalid or expired token" }, 401)
        }

        return c.json({ token: newToken })
      },
    )
    .get(
      "/me",
      describeRoute({
        summary: "Get current user",
        description: "Get information about the currently authenticated user",
        operationId: "userAuth.me",
        responses: {
          200: {
            description: "Current user info",
            content: {
              "application/json": {
                schema: resolver(User.PublicInfo),
              },
            },
          },
          ...errors(401),
        },
      }),
      async (c) => {
        const user = User.current()
        if (!user) {
          return c.json({ error: "Not authenticated" }, 401)
        }

        const userInfo = await User.get(user.id)
        return c.json(userInfo)
      },
    )
    .post(
      "/change-password",
      describeRoute({
        summary: "Change password",
        description: "Change the current user's password",
        operationId: "userAuth.changePassword",
        responses: {
          200: {
            description: "Password changed",
            content: {
              "application/json": {
                schema: resolver(z.object({ success: z.boolean() })),
              },
            },
          },
          ...errors(400, 401),
        },
      }),
      validator(
        "json",
        z.object({
          current_password: z.string().min(1),
          new_password: z.string().min(6),
        }),
      ),
      async (c) => {
        const user = User.current()
        if (!user) {
          return c.json({ error: "Not authenticated" }, 401)
        }

        const { current_password, new_password } = c.req.valid("json")

        // Verify current password
        const verified = await User.verifyPassword(user.username, current_password)
        if (!verified) {
          return c.json({ error: "Current password is incorrect" }, 400)
        }

        await User.updatePassword(user.id, new_password)
        return c.json({ success: true })
      },
    )
}
