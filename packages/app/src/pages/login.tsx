import { createSignal, Show } from "solid-js"
import { useNavigate } from "@solidjs/router"
import { useAuth } from "@/context/auth"
import { Button } from "@opencode-ai/ui/button"
import { TextField } from "@opencode-ai/ui/text-field"

export default function LoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = createSignal("")
  const [password, setPassword] = createSignal("")

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault()
    const success = await auth.login(username(), password())
    if (success) {
      navigate("/")
    }
  }

  return (
    <div class="flex min-h-screen items-center justify-center bg-background-base">
      <div class="w-full max-w-md space-y-8 rounded-lg border border-outline-dimmed bg-background-frame p-8">
        <div class="text-center">
          <h1 class="text-2xl font-semibold text-color-primary">OpenCode</h1>
          <p class="mt-2 text-sm text-color-secondary">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} class="mt-8 space-y-6">
          <Show when={auth.error}>
            <div class="rounded-md bg-auxiliary-error/10 p-3">
              <p class="text-sm text-auxiliary-error">{auth.error}</p>
            </div>
          </Show>

          <div class="space-y-4">
            <TextField
              label="Username"
              type="text"
              value={username()}
              onChange={setUsername}
              placeholder="Enter your username"
              autofocus
              required
            />

            <TextField
              label="Password"
              type="password"
              value={password()}
              onChange={setPassword}
              placeholder="Enter your password"
              required
            />
          </div>

          <Button
            type="submit"
            class="w-full"
            variant="primary"
            disabled={auth.loading || !username() || !password()}
          >
            {auth.loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  )
}
