import { createEffect, createMemo, Show, type ParentProps } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { SDKProvider, useSDK } from "@/context/sdk"
import { SyncProvider, useSync } from "@/context/sync"
import { LocalProvider } from "@/context/local"
import { usePlatform } from "@/context/platform"
import { useAuth } from "@/context/auth"

import { DataProvider } from "@opencode-ai/ui/context"
import { iife } from "@opencode-ai/util/iife"
import type { QuestionAnswer } from "@opencode-ai/sdk/v2"
import { decode64 } from "@/utils/base64"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"

export default function Layout(props: ParentProps) {
  const params = useParams()
  const navigate = useNavigate()
  const language = useLanguage()
  const directory = createMemo(() => {
    return decode64(params.dir) ?? ""
  })

  createEffect(() => {
    if (!params.dir) return
    if (directory()) return
    showToast({
      variant: "error",
      title: language.t("common.requestFailed"),
      description: "Invalid directory in URL.",
    })
    navigate("/")
  })
  return (
    <Show when={directory()}>
      <SDKProvider directory={directory()}>
        <SyncProvider>
          {iife(() => {
            const sync = useSync()
            const sdk = useSDK()
            const platform = usePlatform()
            const auth = useAuth()
            const respond = (input: {
              sessionID: string
              permissionID: string
              response: "once" | "always" | "reject"
            }) => sdk.client.permission.respond(input)

            const replyToQuestion = (input: { requestID: string; answers: QuestionAnswer[] }) =>
              sdk.client.question.reply(input)

            const rejectQuestion = (input: { requestID: string }) => sdk.client.question.reject(input)

            const navigateToSession = (sessionID: string) => {
              navigate(`/${params.dir}/session/${sessionID}`)
            }

            const fetchFn = platform.fetch ?? fetch
            const dir = directory()
            const getHeaders = () => {
              const h: Record<string, string> = {}
              const token = auth.token
              if (token) h["Authorization"] = `Bearer ${token}`
              return h
            }
            const onTaskRetry = async (taskId: string) => {
              const url = `${sdk.url}/task/${taskId}/retry?directory=${encodeURIComponent(dir)}`
              const res = await fetchFn(url, { method: "POST", headers: getHeaders() })
              if (!res.ok) throw new Error(await res.text())
            }
            const onTaskCancel = async (taskId: string) => {
              const url = `${sdk.url}/task/${taskId}/cancel?directory=${encodeURIComponent(dir)}`
              const res = await fetchFn(url, { method: "POST", headers: getHeaders() })
              if (!res.ok) throw new Error(await res.text())
            }

            return (
              <DataProvider
                data={sync.data}
                directory={directory()}
                onPermissionRespond={respond}
                onQuestionReply={replyToQuestion}
                onQuestionReject={rejectQuestion}
                onNavigateToSession={navigateToSession}
                onTaskRetry={onTaskRetry}
                onTaskCancel={onTaskCancel}
              >
                <LocalProvider>{props.children}</LocalProvider>
              </DataProvider>
            )
          })}
        </SyncProvider>
      </SDKProvider>
    </Show>
  )
}
