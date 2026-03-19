import { Button } from "@opencode-ai/ui/button"
import { Show, createEffect, createResource, createSignal } from "solid-js"
import { DEFAULT_WORKSPACE_BOUNDARY_PROMPT, type GlobalConfig, useAdminCommon } from "./shared"

export default function AdminConfigPage() {
  const { authHeaders, fetchFn, readError, server } = useAdminCommon()
  const [error, setError] = createSignal<string | null>(null)
  const [globalPrompt, setGlobalPrompt] = createSignal("")
  const [globalPromptSaving, setGlobalPromptSaving] = createSignal(false)
  const [globalPromptSaved, setGlobalPromptSaved] = createSignal<string | null>(null)

  const fetchGlobalConfig = async () => {
    const response = await fetchFn(`${server.url}/global/config`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error("Failed to fetch global config")
    return response.json() as Promise<GlobalConfig>
  }

  const [globalConfig, { refetch }] = createResource(fetchGlobalConfig)

  createEffect(() => {
    const config = globalConfig()
    if (!config) return
    setGlobalPrompt(config.workspace_boundary_prompt ?? DEFAULT_WORKSPACE_BOUNDARY_PROMPT)
  })

  const saveGlobalPrompt = async () => {
    setError(null)
    setGlobalPromptSaved(null)
    setGlobalPromptSaving(true)
    try {
      const response = await fetchFn(`${server.url}/global/config`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
        },
        body: JSON.stringify({
          workspace_boundary_prompt: globalPrompt().trim() || undefined,
        }),
      })

      if (!response.ok) {
        throw new Error(await readError(response, "Failed to save workspace boundary prompt"))
      }

      await refetch()
      setGlobalPromptSaved("已保存。新会话会自动使用最新提示词。")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save workspace boundary prompt")
    } finally {
      setGlobalPromptSaving(false)
    }
  }

  return (
    <section class="space-y-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-xl font-semibold text-color-primary">全局工作空间边界提示词</h2>
          <p class="mt-1 text-sm text-color-secondary">
            这段内容会作为全局系统提示词注入，用于约束 AI 只能在当前 session workspace 内工作，并禁止改动仓库母体或其他 workspace。
          </p>
        </div>
        <div class="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setGlobalPrompt(DEFAULT_WORKSPACE_BOUNDARY_PROMPT)
              setGlobalPromptSaved(null)
            }}
            disabled={globalPromptSaving() || globalConfig.loading}
          >
            恢复默认
          </Button>
          <Button variant="primary" onClick={saveGlobalPrompt} disabled={globalPromptSaving() || globalConfig.loading}>
            {globalPromptSaving() ? "保存中..." : "保存提示词"}
          </Button>
        </div>
      </div>

      <Show when={error()}>
        <div class="rounded-md bg-auxiliary-error/10 p-3">
          <p class="text-sm text-auxiliary-error">{error()}</p>
        </div>
      </Show>

      <Show when={globalConfig.loading}>
        <p class="text-sm text-color-secondary">正在加载全局配置...</p>
      </Show>

      <Show when={globalConfig.error}>
        <p class="text-sm text-auxiliary-error">加载全局配置失败</p>
      </Show>

      <textarea
        value={globalPrompt()}
        onInput={(e) => {
          setGlobalPrompt(e.currentTarget.value)
          setGlobalPromptSaved(null)
        }}
        placeholder="建议写清楚：只能修改当前 session workspace、严禁修改 git 母体、无法确认路径时不要改。"
        rows={12}
        class="w-full rounded border border-outline-dimmed bg-background-input px-3 py-2 text-sm font-mono"
      />

      <div class="flex items-center justify-between gap-4 text-xs text-color-secondary">
        <p>输入框默认显示当前生效的边界提示词。建议只写工作空间边界、git worktree 约束、路径核验和越界处理规则，避免掺入项目业务规则。</p>
        <Show when={globalPromptSaved()}>
          <p class="text-auxiliary-success">{globalPromptSaved()}</p>
        </Show>
      </div>
    </section>
  )
}
