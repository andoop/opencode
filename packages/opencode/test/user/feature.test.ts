import { expect, test } from "bun:test"
import { User } from "../../src/user"

test("legacy permissions default to all features enabled", () => {
  expect(
    User.features({
      role: "user",
      permission: {
        level: "full",
      },
    }),
  ).toEqual({
    modes: {
      ask: true,
      build: true,
      plan: true,
    },
    files: true,
    models: true,
    providers: true,
    servers: true,
    mcp: true,
  })
})

test("modeEnabled respects feature flags and allowed_agents", () => {
  const permission: User.Permission = {
    level: "full",
    allowed_agents: ["build", "plan"],
    features: {
      modes: {
        ask: true,
        build: true,
        plan: false,
      },
    },
  }

  expect(User.modeEnabled("build", { role: "user", permission })).toBe(true)
  expect(User.modeEnabled("ask", { role: "user", permission })).toBe(false)
  expect(User.modeEnabled("plan", { role: "user", permission })).toBe(false)
})

test("admin always keeps all features enabled", () => {
  const permission: User.Permission = {
    level: "custom",
    features: {
      modes: {
        ask: false,
        build: false,
        plan: false,
      },
      files: false,
      models: false,
      providers: false,
      servers: false,
      mcp: false,
    },
  }

  expect(User.featureEnabled("files", { role: "admin", permission })).toBe(true)
  expect(User.modeEnabled("ask", { role: "admin", permission })).toBe(true)
})
