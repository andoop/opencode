import { createSimpleContext } from "@opencode-ai/ui/context"
import { createSignal, createEffect, onCleanup, type ParentProps } from "solid-js"
import { useServer } from "./server"
import { usePlatform } from "./platform"

const AUTH_TOKEN_KEY = "opencode_auth_token"
const AUTH_USER_KEY = "opencode_auth_user"
type ModelRef = string | { providerID: string; modelID: string }

export const FEATURE_DEFAULTS = {
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
} as const

export type AuthFeatures = {
  modes?: {
    ask?: boolean
    build?: boolean
    plan?: boolean
  }
  files?: boolean
  models?: boolean
  providers?: boolean
  servers?: boolean
  mcp?: boolean
}

export type ResolvedAuthFeatures = {
  modes: {
    ask: boolean
    build: boolean
    plan: boolean
  }
  files: boolean
  models: boolean
  providers: boolean
  servers: boolean
  mcp: boolean
}

export type AuthFeatureKey = Exclude<keyof ResolvedAuthFeatures, "modes">

export function resolveAuthFeatures(user?: Pick<AuthUser, "role" | "permission"> | null): ResolvedAuthFeatures {
  if (user?.role === "admin") {
    return {
      modes: { ...FEATURE_DEFAULTS.modes },
      files: true,
      models: true,
      providers: true,
      servers: true,
      mcp: true,
    }
  }

  const feature = user?.permission.features
  return {
    modes: {
      ask: feature?.modes?.ask ?? FEATURE_DEFAULTS.modes.ask,
      build: feature?.modes?.build ?? FEATURE_DEFAULTS.modes.build,
      plan: feature?.modes?.plan ?? FEATURE_DEFAULTS.modes.plan,
    },
    files: feature?.files ?? FEATURE_DEFAULTS.files,
    models: feature?.models ?? FEATURE_DEFAULTS.models,
    providers: feature?.providers ?? FEATURE_DEFAULTS.providers,
    servers: feature?.servers ?? FEATURE_DEFAULTS.servers,
    mcp: feature?.mcp ?? FEATURE_DEFAULTS.mcp,
  }
}

export function canUseMode(user: Pick<AuthUser, "role" | "permission"> | null | undefined, mode: string) {
  if (user?.role === "admin") return true
  if (mode !== "ask" && mode !== "build" && mode !== "plan") return true
  const features = resolveAuthFeatures(user)
  if (!features.modes[mode]) return false
  if (!user?.permission.allowed_agents) return true
  return user.permission.allowed_agents.includes(mode)
}

export function canUseFeature(user: Pick<AuthUser, "role" | "permission"> | null | undefined, feature: AuthFeatureKey) {
  return resolveAuthFeatures(user)[feature]
}

function modelKey(input: ModelRef) {
  if (typeof input === "string") return input
  return `${input.providerID}/${input.modelID}`
}

export function canUseModel(user: Pick<AuthUser, "role" | "permission"> | null | undefined, model: ModelRef) {
  if (user?.role === "admin") return true
  const allowed = user?.permission.models
  if (allowed === null) return true
  if (!allowed?.length) return false
  return allowed.includes(modelKey(model))
}

export interface AuthUser {
  id: string
  username: string
  email?: string
  role: "admin" | "user"
  permission: {
    level: "full" | "readonly" | "custom"
    custom?: {
      edit?: "allow" | "ask" | "deny"
      write?: "allow" | "ask" | "deny"
      bash?: "allow" | "ask" | "deny"
      read?: "allow" | "ask" | "deny"
    }
    allowed_agents?: ("build" | "ask" | "plan")[]
    features?: AuthFeatures
    models?: string[] | null
  }
}

export const { use: useAuth, provider: AuthProvider } = createSimpleContext({
  name: "Auth",
  init: () => {
    const server = useServer()
    const platform = usePlatform()
    const fetchFn = platform.fetch ?? fetch

    // Load token and user from localStorage
    const storedToken = localStorage.getItem(AUTH_TOKEN_KEY)
    const storedUser = localStorage.getItem(AUTH_USER_KEY)
    const storedMultiUser = localStorage.getItem("opencode_multi_user")

    const [token, setToken] = createSignal<string | null>(storedToken)
    const [user, setUser] = createSignal<AuthUser | null>(storedUser ? JSON.parse(storedUser) : null)
    const [loading, setLoading] = createSignal(true) // Start with loading true
    const [error, setError] = createSignal<string | null>(null)
    const [multiUserEnabled, setMultiUserEnabledSignal] = createSignal(storedMultiUser === "true")

    // Persist token and user to localStorage
    createEffect(() => {
      const currentToken = token()
      if (currentToken) {
        localStorage.setItem(AUTH_TOKEN_KEY, currentToken)
      } else {
        localStorage.removeItem(AUTH_TOKEN_KEY)
      }
    })

    createEffect(() => {
      const currentUser = user()
      if (currentUser) {
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(currentUser))
      } else {
        localStorage.removeItem(AUTH_USER_KEY)
      }
    })

    createEffect(() => {
      if (multiUserEnabled()) {
        localStorage.setItem("opencode_multi_user", "true")
      } else {
        localStorage.removeItem("opencode_multi_user")
      }
    })

    // Check if multi-user mode is enabled on mount
    void (async () => {
      try {
        // Check server config for multi-user mode
        const configResponse = await fetchFn(`${server.url}/config`)
        if (configResponse.ok) {
          const config = await configResponse.json()
          if (config.multiUser) {
            setMultiUserEnabledSignal(true)
          }
        }

        // If we have a token, verify it
        const currentToken = storedToken
        if (currentToken) {
          const meResponse = await fetchFn(`${server.url}/user-auth/me`, {
            headers: { Authorization: `Bearer ${currentToken}` },
          })
          if (!meResponse.ok) {
            // Token is invalid, clear it
            setToken(null)
            setUser(null)
          } else {
            const userData = await meResponse.json()
            setUser(userData)
            setMultiUserEnabledSignal(true)
          }
        }
      } catch {
        // Network error
      } finally {
        setLoading(false)
      }
    })()

    const login = async (username: string, password: string) => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetchFn(`${server.url}/user-auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error || data.message || "Login failed")
        }

        const data = await response.json()
        setToken(data.token)
        setUser(data.user)
        setMultiUserEnabledSignal(true)
        return true
      } catch (e) {
        const message = e instanceof Error ? e.message : "Login failed"
        setError(message)
        return false
      } finally {
        setLoading(false)
      }
    }

    const register = async (phone: string, password: string, confirmPassword: string) => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetchFn(`${server.url}/user-auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, password, confirmPassword }),
        })

        if (!response.ok) {
          const data = await response.json().catch(() => ({}))
          throw new Error(data.error || data.message || "Registration failed")
        }

        const data = await response.json()
        setToken(data.token)
        setUser(data.user)
        setMultiUserEnabledSignal(true)
        return true
      } catch (e) {
        const message = e instanceof Error ? e.message : "Registration failed"
        setError(message)
        return false
      } finally {
        setLoading(false)
      }
    }

    const logout = () => {
      setToken(null)
      setUser(null)
      setError(null)
    }

    const refreshToken = async () => {
      const currentToken = token()
      if (!currentToken) return false

      try {
        const response = await fetchFn(`${server.url}/user-auth/refresh`, {
          method: "POST",
          headers: { Authorization: `Bearer ${currentToken}` },
        })

        if (!response.ok) {
          logout()
          return false
        }

        const data = await response.json()
        setToken(data.token)
        return true
      } catch {
        return false
      }
    }

    // Refresh token periodically (every 20 minutes)
    const refreshInterval = setInterval(
      () => {
        if (token()) {
          void refreshToken()
        }
      },
      20 * 60 * 1000,
    )

    onCleanup(() => {
      clearInterval(refreshInterval)
    })

    return {
      get token() {
        return token()
      },
      get user() {
        return user()
      },
      get isAuthenticated() {
        return !!token()
      },
      get isAdmin() {
        return user()?.role === "admin"
      },
      get loading() {
        return loading()
      },
      get error() {
        return error()
      },
      get permission() {
        return user()?.permission ?? { level: "full" as const }
      },
      get features() {
        return resolveAuthFeatures(user())
      },
      get isMultiUserEnabled() {
        return multiUserEnabled()
      },
      canFeature(feature: AuthFeatureKey) {
        return canUseFeature(user(), feature)
      },
      canMode(mode: string) {
        return canUseMode(user(), mode)
      },
      canModel(model: ModelRef) {
        return canUseModel(user(), model)
      },
      login,
      register,
      logout,
      refreshToken,
    }
  },
})

// Add auth interceptor to SDK client — injects Authorization header on every request
export function addAuthInterceptor(
  client: { interceptors: { request: { use: (fn: (request: Request) => Request) => number } } },
  getToken: () => string | null,
) {
  client.interceptors.request.use((request) => {
    const token = getToken()
    if (token) request.headers.set("Authorization", `Bearer ${token}`)
    // Ensure Content-Type is set for requests with body — some environments strip it
    if (
      !request.headers.get("content-type") &&
      (request.method === "POST" || request.method === "PUT" || request.method === "PATCH")
    ) {
      request.headers.set("Content-Type", "application/json")
    }
    return request
  })
}

// Helper to get auth headers for API requests
export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

// Check if multi-user mode is enabled (can be determined by server response)
export function isMultiUserEnabled(): boolean {
  // This will be set based on server configuration
  return localStorage.getItem("opencode_multi_user") === "true"
}

export function setMultiUserEnabled(enabled: boolean): void {
  if (enabled) {
    localStorage.setItem("opencode_multi_user", "true")
  } else {
    localStorage.removeItem("opencode_multi_user")
  }
}
