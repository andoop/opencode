import type {
  Message,
  Session,
  Part,
  SessionStatus,
  PermissionRequest,
  QuestionRequest,
  QuestionAnswer,
} from "@opencode-ai/sdk/v2"
import { createSimpleContext } from "./helper"

type Data = {
  session: Session[]
  session_status: {
    [sessionID: string]: SessionStatus
  }
  permission?: {
    [sessionID: string]: PermissionRequest[]
  }
  question?: {
    [sessionID: string]: QuestionRequest[]
  }
  message: {
    [sessionID: string]: Message[]
  }
  part: {
    [messageID: string]: Part[]
  }
}

export type PermissionRespondFn = (input: {
  sessionID: string
  permissionID: string
  response: "once" | "always" | "reject"
}) => void

export type QuestionReplyFn = (input: { requestID: string; answers: QuestionAnswer[] }) => void

export type QuestionRejectFn = (input: { requestID: string }) => void

export type NavigateToSessionFn = (sessionID: string) => void

export type OnTaskRetryFn = (taskId: string) => Promise<void>
export type OnTaskCancelFn = (taskId: string) => Promise<void>

export const { use: useData, provider: DataProvider } = createSimpleContext({
  name: "Data",
  init: (props: {
    data: Data
    directory: string
    onPermissionRespond?: PermissionRespondFn
    onQuestionReply?: QuestionReplyFn
    onQuestionReject?: QuestionRejectFn
    onNavigateToSession?: NavigateToSessionFn
    onTaskRetry?: OnTaskRetryFn
    onTaskCancel?: OnTaskCancelFn
  }) => {
    return {
      get store() {
        return props.data
      },
      get directory() {
        return props.directory
      },
      respondToPermission: props.onPermissionRespond,
      replyToQuestion: props.onQuestionReply,
      rejectQuestion: props.onQuestionReject,
      navigateToSession: props.onNavigateToSession,
      onTaskRetry: props.onTaskRetry,
      onTaskCancel: props.onTaskCancel,
    }
  },
})
