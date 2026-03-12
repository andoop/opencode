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

test("modelEnabled blocks legacy users without explicit model permissions", () => {
  expect(
    User.modelEnabled("openai/gpt-5", {
      role: "user",
      permission: {
        level: "full",
      },
    }),
  ).toBe(false)
})

test("modelEnabled allows explicit unrestricted state", () => {
  expect(
    User.modelEnabled("openai/gpt-5", {
      role: "user",
      permission: {
        level: "full",
        models: null,
      },
    }),
  ).toBe(true)
})

test("modelEnabled respects explicit whitelist", () => {
  const permission: User.Permission = {
    level: "full",
    models: ["openai/gpt-5", "anthropic/claude-sonnet-4-5"],
  }

  expect(User.modelEnabled("openai/gpt-5", { role: "user", permission })).toBe(true)
  expect(
    User.modelEnabled(
      {
        providerID: "anthropic",
        modelID: "claude-sonnet-4-5",
      },
      { role: "user", permission },
    ),
  ).toBe(true)
  expect(User.modelEnabled("openai/gpt-5-mini", { role: "user", permission })).toBe(false)
})

test("filterModels removes non-whitelisted models and empty providers", () => {
  const providers: Array<{ id: string; models: Record<string, { id: string }> }> = [
    {
      id: "openai",
      models: {
        "gpt-5": { id: "gpt-5" },
        "gpt-5-mini": { id: "gpt-5-mini" },
      },
    },
    {
      id: "anthropic",
      models: {
        "claude-sonnet-4-5": { id: "claude-sonnet-4-5" },
      },
    },
  ]

  expect(
    User.filterModels(providers, {
      role: "user",
      permission: {
        level: "full",
        models: ["openai/gpt-5"],
      },
    }),
  ).toEqual([
    {
      id: "openai",
      models: {
        "gpt-5": { id: "gpt-5" },
      },
    },
  ])
})
