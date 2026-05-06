import { useNavigate } from "@solidjs/router"
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { For, Show, createMemo } from "solid-js"
import { useAuth, FEATURE_DEFAULTS } from "@/context/auth"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"

export interface UserInfo {
  id: string
  username: string
  email?: string
  role: "admin" | "user"
  status: "active" | "disabled"
  permission: {
    level: "full" | "readonly" | "custom"
    custom?: Record<string, string>
    allowed_agents?: string[]
    features?: {
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
    models?: string[] | null
  }
  time: {
    created: number
    updated: number
    last_login?: number
  }
}

export interface RegistryProject {
  id: string
  project_id: string
  directory: string
  name?: string
  description?: string
  profile_markdown?: string
  group_ids: string[]
  groups: string[]
  visibility: {
    mode: "all" | "include" | "exclude"
    user_ids: string[]
  }
  created_by?: string
  vcs?: "git"
  time: {
    created: number
    updated: number
  }
}

export interface GroupInfo {
  id: string
  slug: string
  name: string
  description?: string
  profile_markdown?: string
  created_by?: string
  time: {
    created: number
    updated: number
  }
}

export interface ProviderInfo {
  id: string
  name: string
  models: Record<
    string,
    {
      id: string
      name: string
    }
  >
}

export interface AuditSummary {
  sessions: number
  users: number
  projects: number
  prompts: number
  last_activity?: number
}

export interface AuditSession {
  session: {
    id: string
    title: string
    projectID: string
    userID?: string
    time: {
      created: number
      updated: number
    }
  }
  user: {
    id?: string
    username?: string
  }
  project: {
    id: string
    name?: string
    description?: string
    directory: string
  }
  message_count: number
  prompt_count: number
  last_prompt?: string
  last_prompt_at?: number
}

export interface AuditPrompt {
  messageID: string
  created: number
  role: "user" | "assistant"
  text?: string
  parts: Array<{
    type: string
    count: number
  }>
}

export type StorageCategory =
  | "workspaces"
  | "closedWorkspaces"
  | "snapshots"
  | "cache"
  | "tmpUploads"
  | "archivedSessions"
  | "orphanWorkspaces"
  | "orphanUserWorktrees"
  | "danglingStorage"

export interface StorageItem {
  id: string
  category: StorageCategory
  label: string
  bytes: number
  risk: "low" | "medium" | "high"
  active: boolean
  reason: string
  paths: string[]
  metadata: Record<string, string>
}

export interface StorageCategorySummary {
  category: StorageCategory
  count: number
  bytes: number
  reclaimable: number
  high_risk: number
}

export interface StorageUserSummary {
  userID: string
  username?: string
  count: number
  bytes: number
  high_risk: number
}

export interface StorageSummary {
  scanned_at: number
  total_bytes: number
  reclaimable_bytes: number
  high_risk: number
  categories: StorageCategorySummary[]
  users: StorageUserSummary[]
  items: StorageItem[]
}

export interface StoragePlan {
  scanned_at: number
  force: boolean
  total_bytes: number
  items: StorageItem[]
  skipped: StorageItem[]
}

export interface StorageCleanupResult {
  scanned_at: number
  force: boolean
  total_bytes: number
  removed: StorageItem[]
  skipped: StorageItem[]
  failed: Array<{
    item: StorageItem
    error: string
  }>
}

export interface GlobalConfig {
  workspace_boundary_prompt?: string
}

export const DEFAULT_WORKSPACE_BOUNDARY_PROMPT = `
工作空间边界规则：
- 当前 session workspace 中的每个项目都使用独立的 git worktree。
- 只允许读取和修改当前 session workspace 及其 session roots 内的文件。
- 严禁修改任何项目的仓库共享源码母体、主 git worktree、上级源码目录，或任何不属于当前 session workspace 的文件。
- 对所有待修改路径、绝对路径、相对路径、符号链接目标、shell 命令工作目录，都必须先确认它们属于当前 session workspace。
- 任何超出当前 session workspace 的路径都视为越界；除非系统明确授予所需权限，否则不得继续操作。
- 如果某个路径可能指向其他 workspace、其他 session、其他用户的 worktree，或共享仓库根目录，必须停止修改，明确说明风险，并请求用户确认正确目标。
- 当用户请求修改工作空间外部文件、仓库母体或共享目录时，不要直接执行，应先指出该请求超出当前 session 边界。
- 如果无法确认目标路径是否安全，默认视为不安全，不要修改。
`.trim()

export type FeatureState = {
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

const FEATURE_ROWS = [
  { id: "modes.ask", label: "Ask 模式", description: "允许使用 ask 只读模式" },
  { id: "modes.build", label: "Build 模式", description: "允许使用 build 模式" },
  { id: "modes.plan", label: "Plan 模式", description: "允许使用 plan 模式" },
  { id: "files", label: "文件功能", description: "文件树、文件选择、上下文文件、Git/文件相关视图" },
  { id: "models", label: "模型入口", description: "模型选择和模型管理入口" },
  { id: "providers", label: "供应商入口", description: "供应商连接、断开和自定义供应商配置" },
  { id: "servers", label: "服务器入口", description: "服务器切换与服务器管理入口" },
  { id: "mcp", label: "MCP 管理", description: "MCP 列表、开关与管理入口" },
] as const

export const DEFAULT_REGISTER_MODELS = [
  "cursor-cli/auto",
  "cursor-cli/composer-1",
  "cursor-cli/composer-1.5",
  "cursor-cli/composer-2",
  "cursor-cli/composer-2-fast",
]

export const DEFAULT_PROJECT_VISIBILITY: RegistryProject["visibility"] = {
  mode: "all",
  user_ids: [],
}

export function useAdminCommon() {
  const auth = useAuth()
  const navigate = useNavigate()
  const server = useServer()
  const platform = usePlatform()
  const language = useLanguage()
  const dialog = useDialog()
  const fetchFn = platform.fetch ?? fetch

  const authHeaders = (): HeadersInit => {
    const token = auth.token
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const readError = async (response: Response, fallback: string) => {
    const data = await response.json().catch(() => undefined as any)
    return data?.error || data?.message || data?.data?.message || fallback
  }

  return {
    auth,
    navigate,
    server,
    platform,
    language,
    dialog,
    fetchFn,
    authHeaders,
    readError,
  }
}

export function createRegisteredFeatures(): FeatureState {
  return {
    modes: {
      ask: true,
      build: false,
      plan: false,
    },
    files: true,
    models: false,
    providers: false,
    servers: false,
    mcp: false,
  }
}

export function createFeatures(permission?: UserInfo["permission"]): FeatureState {
  return {
    modes: {
      ask: permission?.features?.modes?.ask ?? FEATURE_DEFAULTS.modes.ask,
      build: permission?.features?.modes?.build ?? FEATURE_DEFAULTS.modes.build,
      plan: permission?.features?.modes?.plan ?? FEATURE_DEFAULTS.modes.plan,
    },
    files: permission?.features?.files ?? FEATURE_DEFAULTS.files,
    models: permission?.features?.models ?? FEATURE_DEFAULTS.models,
    providers: permission?.features?.providers ?? FEATURE_DEFAULTS.providers,
    servers: permission?.features?.servers ?? FEATURE_DEFAULTS.servers,
    mcp: permission?.features?.mcp ?? FEATURE_DEFAULTS.mcp,
  }
}

export function modelSummary(permission?: UserInfo["permission"]) {
  if (!permission) return "未配置"
  if (permission.models === null) return "全开放"
  if (permission.models === undefined) return "未配置"
  if (permission.models.length === 0) return "0 个模型"
  return `${permission.models.length} 个模型`
}

export function FeatureMatrix(props: {
  value: FeatureState
  disabled?: boolean
  onToggle: (id: (typeof FEATURE_ROWS)[number]["id"], checked: boolean) => void
}) {
  return (
    <div class="rounded border border-outline-dimmed p-4 space-y-3">
      <div>
        <p class="text-sm text-color-primary">功能权限矩阵</p>
        <p class="text-xs text-color-secondary">未勾选的功能会在前端隐藏，后端也会拒绝对应请求。</p>
      </div>
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-outline-dimmed">
            <th class="pb-2 text-left font-medium">功能</th>
            <th class="pb-2 text-left font-medium">说明</th>
            <th class="pb-2 text-right font-medium">启用</th>
          </tr>
        </thead>
        <tbody>
          <For each={FEATURE_ROWS}>
            {(row) => {
              const checked = () => {
                if (row.id === "modes.ask") return props.value.modes.ask
                if (row.id === "modes.build") return props.value.modes.build
                if (row.id === "modes.plan") return props.value.modes.plan
                return props.value[row.id]
              }

              return (
                <tr class="border-b border-outline-dimmed last:border-0">
                  <td class="py-3 pr-3 align-top">{row.label}</td>
                  <td class="py-3 pr-3 align-top text-color-secondary">{row.description}</td>
                  <td class="py-3 text-right align-top">
                    <input
                      type="checkbox"
                      checked={checked()}
                      disabled={props.disabled}
                      onChange={(e) => props.onToggle(row.id, e.currentTarget.checked)}
                    />
                  </td>
                </tr>
              )
            }}
          </For>
        </tbody>
      </table>
    </div>
  )
}

export function ModelWhitelist(props: {
  providers?: ProviderInfo[]
  search: string
  value: string[] | null
  disabled?: boolean
  error?: string
  onSearch: (value: string) => void
  onToggle: (value: string, checked: boolean) => void
  onAllowAll: () => void
  onClear: () => void
}) {
  const unrestricted = createMemo(() => props.value === null)
  const value = createMemo(() => new Set(props.value ?? []))
  const selected = createMemo(() =>
    (props.providers ?? [])
      .flatMap((provider) =>
        Object.values(provider.models)
          .filter((model) => value().has(`${provider.id}/${model.id}`))
          .map((model) => ({
            key: `${provider.id}/${model.id}`,
            providerID: provider.id,
            providerName: provider.name,
            modelID: model.id,
            modelName: model.name,
          })),
      )
      .sort((a, b) => a.providerName.localeCompare(b.providerName) || a.modelName.localeCompare(b.modelName)),
  )
  const filtered = createMemo(() => {
    const query = props.search.trim().toLowerCase()
    return (props.providers ?? []).flatMap((provider) => {
      const models = Object.values(provider.models)
        .filter((model) => {
          if (!query) return true
          return [provider.name, provider.id, model.name, model.id].some((item) => item.toLowerCase().includes(query))
        })
        .sort((a, b) => {
          const aSelected = value().has(`${provider.id}/${a.id}`)
          const bSelected = value().has(`${provider.id}/${b.id}`)
          if (aSelected && !bSelected) return -1
          if (!aSelected && bSelected) return 1
          return a.name.localeCompare(b.name)
        })
      if (models.length === 0) return []
      return [
        {
          ...provider,
          models,
        },
      ]
    })
  })

  return (
    <div class="rounded border border-outline-dimmed p-4 space-y-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-sm text-color-primary">可用模型</p>
          <p class="text-xs text-color-secondary">
            默认不开放任何模型。只有“清空限制”才表示全开放，这里不影响供应商管理权限。
          </p>
        </div>
        <div class="flex gap-2">
          <Button size="small" variant="ghost" onClick={props.onAllowAll} disabled={props.disabled}>
            全部允许
          </Button>
          <Button size="small" variant="ghost" onClick={props.onClear} disabled={props.disabled}>
            清空限制
          </Button>
        </div>
      </div>
      <input
        value={props.search}
        onInput={(e) => props.onSearch(e.currentTarget.value)}
        placeholder="搜索 provider / model / id"
        class="w-full rounded border border-outline-dimmed bg-background-input px-3 py-2 text-sm"
      />
      <Show when={props.error}>
        <p class="text-xs text-auxiliary-error">{props.error}</p>
      </Show>
      <Show when={unrestricted()}>
        <div class="rounded border border-outline-dimmed p-3 text-sm text-color-secondary">
          当前为清空限制状态：该用户可使用所有模型，包括后续新增模型。
        </div>
      </Show>
      <Show when={selected().length > 0}>
        <div class="rounded border border-outline-dimmed p-3 space-y-2">
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm text-color-primary">已选模型</p>
            <p class="text-xs text-color-secondary">{selected().length} 个</p>
          </div>
          <div class="max-h-36 space-y-2 overflow-auto">
            <For each={selected()}>
              {(item) => (
                <label class="flex items-start justify-between gap-3 rounded border border-outline-dimmed px-3 py-2 text-sm">
                  <div>
                    <div>{item.modelName}</div>
                    <div class="text-xs text-color-secondary">
                      {item.providerName} · {item.key}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked
                    disabled={props.disabled}
                    onChange={(e) => props.onToggle(item.key, e.currentTarget.checked)}
                  />
                </label>
              )}
            </For>
          </div>
        </div>
      </Show>
      <div class="max-h-72 space-y-3 overflow-auto rounded border border-outline-dimmed p-3">
        <Show when={props.providers} fallback={<p class="text-sm text-color-secondary">Loading models...</p>}>
          <Show when={filtered().length > 0} fallback={<p class="text-sm text-color-secondary">No models found.</p>}>
            <For each={filtered()}>
              {(provider) => (
                <div class="space-y-2">
                  <div class="text-sm font-medium text-color-primary">
                    {provider.name}
                    <span class="ml-2 text-xs text-color-secondary">{provider.id}</span>
                  </div>
                  <div class="space-y-2">
                    <For each={provider.models}>
                      {(model) => {
                        const key = `${provider.id}/${model.id}`
                        return (
                          <label class="flex items-start justify-between gap-3 rounded border border-outline-dimmed px-3 py-2 text-sm">
                            <div>
                              <div class="flex items-center gap-2">
                                <span>{model.name}</span>
                                <Show when={unrestricted() || value().has(key)}>
                                  <span class="text-xs text-auxiliary-success">已选</span>
                                </Show>
                              </div>
                              <div class="text-xs text-color-secondary">{key}</div>
                            </div>
                            <input
                              type="checkbox"
                              checked={unrestricted() || value().has(key)}
                              disabled={props.disabled}
                              onChange={(e) => props.onToggle(key, e.currentTarget.checked)}
                            />
                          </label>
                        )
                      }}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </Show>
      </div>
    </div>
  )
}
