import { Log } from "@/util/log"
import { NamedError } from "@opencode-ai/util/error"
import { User } from "./index"
import z from "zod"
import { SignJWT, jwtVerify } from "jose"

export namespace UserAuth {
  const log = Log.create({ service: "user-auth" })

  const JWT_SECRET = new TextEncoder().encode(
    process.env.OPENCODE_JWT_SECRET || "opencode-jwt-secret-change-in-production",
  )
  const JWT_EXPIRES = "24h"

  // JWT Payload schema
  export const Payload = z
    .object({
      user_id: z.string(),
      username: z.string(),
      role: User.Role,
      permission: User.Permission,
      iat: z.number(),
      exp: z.number(),
    })
    .meta({ ref: "UserAuth.Payload" })
  export type Payload = z.infer<typeof Payload>

  // Login response schema
  export const LoginResponse = z
    .object({
      token: z.string(),
      user: User.PublicInfo,
    })
    .meta({ ref: "UserAuth.LoginResponse" })
  export type LoginResponse = z.infer<typeof LoginResponse>

  // Errors
  export const TokenExpiredError = NamedError.create("TokenExpiredError", z.object({ expired_at: z.number() }))

  export const InvalidTokenError = NamedError.create("InvalidTokenError", z.object({ message: z.string() }))

  // Login and return JWT token
  export async function login(username: string, password: string): Promise<LoginResponse> {
    const user = await User.verifyPassword(username, password)
    if (!user) {
      throw new User.InvalidCredentialsError({ message: "Invalid username or password" })
    }

    if (user.status !== "active") {
      throw new User.InvalidCredentialsError({ message: "Account is disabled" })
    }

    const token = await sign({
      user_id: user.id,
      username: user.username,
      role: user.role,
      permission: user.permission,
    })

    log.info("login", { username: user.username, user_id: user.id })

    const { password: _, ...publicUser } = user
    return { token, user: publicUser }
  }

  // Sign a JWT token
  export async function sign(payload: Omit<Payload, "iat" | "exp">): Promise<string> {
    const jwt = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(JWT_EXPIRES)
      .sign(JWT_SECRET)
    return jwt
  }

  // Verify and decode JWT token
  export async function verify(token: string): Promise<Payload | null> {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET)
      const result = Payload.safeParse(payload)
      if (!result.success) {
        log.warn("invalid_token_payload", { error: result.error })
        return null
      }
      return result.data
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "JWTExpired") {
          log.info("token_expired")
        } else {
          log.warn("token_verification_failed", { error: error.message })
        }
      }
      return null
    }
  }

  // Refresh token (issue new token with same user data)
  export async function refresh(token: string): Promise<string | null> {
    const payload = await verify(token)
    if (!payload) return null

    // Verify user still exists and is active
    try {
      const user = await User.getInternal(payload.user_id)
      if (user.status !== "active") return null

      return sign({
        user_id: user.id,
        username: user.username,
        role: user.role,
        permission: user.permission,
      })
    } catch {
      return null
    }
  }

  // Get user context from token
  export async function getUserContext(token: string): Promise<User.UserContext | null> {
    const payload = await verify(token)
    if (!payload) return null

    return {
      id: payload.user_id,
      username: payload.username,
      role: payload.role,
      permission: payload.permission,
    }
  }
}
