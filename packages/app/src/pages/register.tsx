import { createEffect, createSignal, Show, onCleanup, onMount } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { useAuth } from "@/context/auth"
import { Button } from "@opencode-ai/ui/button"
import { TextField } from "@opencode-ai/ui/text-field"

const PHONE_PATTERN = /^1[3-9]\d{9}$/

export default function RegisterPage() {
  const auth = useAuth()
  const navigate = useNavigate()

  const [phone, setPhone] = createSignal("")
  const [password, setPassword] = createSignal("")
  const [confirmPassword, setConfirmPassword] = createSignal("")
  const [localError, setLocalError] = createSignal<string | null>(null)

  onMount(() => {
    document.body.style.overflow = "hidden"
  })

  onCleanup(() => {
    document.body.style.overflow = ""
  })

  createEffect(() => {
    if (!auth.loading && !auth.isMultiUserEnabled) {
      navigate("/login")
    }
  })

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setLocalError(null)
    const value = phone().trim()
    if (!PHONE_PATTERN.test(value)) {
      setLocalError("请输入有效的中国大陆手机号")
      return
    }
    if (password() !== confirmPassword()) {
      setLocalError("两次输入的密码不一致")
      return
    }
    const success = await auth.register(value, password(), confirmPassword())
    if (success) {
      navigate("/")
    }
  }

  return (
    <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-background-base">
      <div class="w-full max-w-md space-y-8 rounded-lg border border-outline-dimmed bg-background-frame p-8">
        <div class="text-center">
          <h1 class="text-2xl font-semibold text-color-primary">RealseeCode</h1>
          <p class="mt-2 text-sm text-color-secondary">注册新账号</p>
        </div>

        <form onSubmit={handleSubmit} class="mt-8 space-y-6">
          <Show when={localError() || auth.error}>
            <div class="rounded-md bg-auxiliary-error/10 p-3">
              <p class="text-sm text-auxiliary-error">{localError() || auth.error}</p>
            </div>
          </Show>

          <div class="space-y-4">
            <TextField
              label="手机号"
              type="tel"
              value={phone()}
              onChange={setPhone}
              placeholder="请输入中国大陆手机号"
              autofocus
              required
            />

            <TextField
              label="密码"
              type="password"
              value={password()}
              onChange={setPassword}
              placeholder="请输入密码"
              required
            />

            <TextField
              label="确认密码"
              type="password"
              value={confirmPassword()}
              onChange={setConfirmPassword}
              placeholder="请再次输入密码"
              required
            />
          </div>

          <div class="space-y-3">
            <Button
              type="submit"
              class="w-full"
              variant="primary"
              disabled={auth.loading || !phone() || !password() || !confirmPassword()}
            >
              {auth.loading ? "注册中..." : "注册"}
            </Button>
            <Button type="button" class="w-full" variant="ghost" onClick={() => navigate("/login")}>
              返回登录
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
