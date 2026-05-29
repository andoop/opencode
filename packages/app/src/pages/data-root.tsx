import { Button } from "@opencode-ai/ui/button"
import { Logo } from "@opencode-ai/ui/logo"
import { createSignal, Show } from "solid-js"
import { usePlatform } from "@/context/platform"
import { useServer } from "@/context/server"

type Validation = {
  ok: boolean
  root: string
  exists: boolean
  initialized: boolean
  reason?: string
}

type BindResult = {
  root: string
  restartRequired: boolean
}

export default function DataRootSetup() {
  const server = useServer()
  const platform = usePlatform()
  const fetchFn = platform.fetch ?? fetch
  const [value, setValue] = createSignal("")
  const [validation, setValidation] = createSignal<Validation>()
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal("")
  const [bound, setBound] = createSignal<BindResult>()

  async function request<T>(path: string) {
    const response = await fetchFn(`${server.url}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ path: value().trim() }),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(text || `Request failed with ${response.status}`)
    }
    return response.json() as Promise<T>
  }

  async function validate() {
    setBusy(true)
    setError("")
    setBound()
    try {
      setValidation(await request<Validation>("/data-root/validate"))
    } catch (e) {
      setValidation()
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  async function bind() {
    setBusy(true)
    setError("")
    try {
      const result = await request<BindResult>("/data-root/bind")
      setBound(result)
      setTimeout(() => window.location.reload(), 500)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="mx-auto mt-42 flex w-full max-w-2xl flex-col items-center px-4">
      <Logo class="w-96 opacity-12" />
      <div class="mt-10 w-full rounded-xl border border-border-base bg-background-frame p-5">
        <div class="text-18-medium text-text-strong">Portable Opencode Data Root</div>
        <div class="mt-2 text-13-regular text-text-weak">
          选择移动硬盘上的 opencode 数据根目录。系统会在里面创建 data、config、cache、state，并且之后只从这里读写数据。
        </div>
        <div class="mt-5 flex gap-2">
          <input
            value={value()}
            onInput={(e) => {
              setValue(e.currentTarget.value)
              setValidation()
              setError("")
              setBound()
            }}
            placeholder="/Volumes/External/opencode"
            class="min-w-0 flex-1 rounded-md border border-border-base bg-background-base px-3 py-2 text-14-regular text-text-strong focus:outline-none focus:ring-2 focus:ring-border-strong-base"
          />
          <Button variant="ghost" disabled={busy() || !value().trim()} onClick={validate}>
            验证
          </Button>
          <Button disabled={busy() || !validation()?.ok} onClick={bind}>
            绑定
          </Button>
        </div>
        <Show when={validation()}>
          {(item) => (
            <div
              classList={{
                "mt-4 rounded-md border p-3 text-13-regular": true,
                "border-border-base text-text-strong": item().ok,
                "border-border-danger-base text-text-danger": !item().ok,
              }}
            >
              <div>{item().ok ? "路径可用" : (item().reason ?? "路径不可用")}</div>
              <div class="mt-1 break-all text-text-weak">{item().root}</div>
              <div class="mt-1 text-text-weak">{item().initialized ? "已是新格式目录" : "将按新格式初始化"}</div>
            </div>
          )}
        </Show>
        <Show when={error()}>
          <div class="mt-4 rounded-md border border-border-danger-base p-3 text-13-regular text-text-danger">
            {error()}
          </div>
        </Show>
        <Show when={bound()}>
          {(item) => (
            <div class="mt-4 rounded-md border border-border-base p-3 text-13-regular text-text-strong">
              <div>已绑定数据根目录：{item().root}</div>
              <div class="mt-1 text-text-weak">
                正在刷新进入应用。之后所有 opencode 数据都会从这个目录加载。
              </div>
            </div>
          )}
        </Show>
      </div>
    </div>
  )
}
