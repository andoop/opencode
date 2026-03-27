import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { Identifier } from "@/id/id"
import { Instance } from "@/project/instance"
import { Log } from "@/util/log"
import z from "zod"

export namespace Select {
  const log = Log.create({ service: "select" })

  export const Option = z
    .object({
      label: z.string().describe("Display text for the option"),
      description: z.string().optional().describe("Optional explanation shown under the option"),
      keywords: z.array(z.string()).optional().describe("Optional extra search keywords"),
    })
    .meta({
      ref: "SelectOption",
    })
  export type Option = z.infer<typeof Option>

  export const Request = z
    .object({
      id: Identifier.schema("select"),
      sessionID: Identifier.schema("session"),
      title: z.string().optional().describe("Optional title shown above the selector"),
      placeholder: z.string().optional().describe("Optional search placeholder"),
      options: z.array(Option).describe("Available options to search and choose from"),
      custom: z.boolean().optional().describe("Allow typing a custom value"),
      tool: z
        .object({
          messageID: z.string(),
          callID: z.string(),
        })
        .optional(),
    })
    .meta({
      ref: "SelectRequest",
    })
  export type Request = z.infer<typeof Request>

  export const Reply = z
    .object({
      value: z.string().describe("Selected or typed value"),
      source: z.enum(["option", "custom"]).optional().describe("Where the value came from"),
    })
    .meta({
      ref: "SelectReply",
    })
  export type Reply = z.infer<typeof Reply>

  export const Event = {
    Asked: BusEvent.define("select.asked", Request),
    Replied: BusEvent.define(
      "select.replied",
      z.object({
        sessionID: z.string(),
        requestID: z.string(),
        value: z.string(),
        source: z.enum(["option", "custom"]).optional(),
      }),
    ),
    Rejected: BusEvent.define(
      "select.rejected",
      z.object({
        sessionID: z.string(),
        requestID: z.string(),
      }),
    ),
  }

  const state = Instance.state(async () => {
    const pending: Record<
      string,
      {
        info: Request
        resolve: (reply: Reply) => void
        reject: (e: any) => void
      }
    > = {}

    return {
      pending,
    }
  })

  export async function ask(input: {
    sessionID: string
    title?: string
    placeholder?: string
    options: Option[]
    custom?: boolean
    tool?: { messageID: string; callID: string }
    abort?: AbortSignal
  }): Promise<Reply> {
    const s = await state()
    const id = Identifier.ascending("select")

    log.info("asking", { id, options: input.options.length })

    return new Promise<Reply>((resolve, reject) => {
      if (input.abort?.aborted) {
        reject(new RejectedError())
        return
      }

      const info: Request = {
        id,
        sessionID: input.sessionID,
        title: input.title,
        placeholder: input.placeholder,
        options: input.options,
        custom: input.custom,
        tool: input.tool,
      }
      s.pending[id] = {
        info,
        resolve,
        reject,
      }

      const cleanup = () => {
        if (!s.pending[id]) return
        delete s.pending[id]
        log.info("aborted", { id })
        Bus.publish(Event.Rejected, {
          sessionID: info.sessionID,
          requestID: info.id,
        })
        reject(new RejectedError())
      }

      input.abort?.addEventListener("abort", cleanup, { once: true })

      Bus.publish(Event.Asked, info)
    })
  }

  export async function reply(input: {
    requestID: string
    value: string
    source?: "option" | "custom"
  }): Promise<void> {
    const s = await state()
    const existing = s.pending[input.requestID]
    if (!existing) {
      log.warn("reply for unknown request", { requestID: input.requestID })
      return
    }
    delete s.pending[input.requestID]

    log.info("replied", { requestID: input.requestID, source: input.source })

    Bus.publish(Event.Replied, {
      sessionID: existing.info.sessionID,
      requestID: existing.info.id,
      value: input.value,
      source: input.source,
    })

    existing.resolve({
      value: input.value,
      source: input.source,
    })
  }

  export async function reject(requestID: string): Promise<void> {
    const s = await state()
    const existing = s.pending[requestID]
    if (!existing) {
      log.warn("reject for unknown request", { requestID })
      return
    }
    delete s.pending[requestID]

    log.info("rejected", { requestID })

    Bus.publish(Event.Rejected, {
      sessionID: existing.info.sessionID,
      requestID: existing.info.id,
    })

    existing.reject(new RejectedError())
  }

  export class RejectedError extends Error {
    constructor() {
      super("The user dismissed this selection")
    }
  }

  export async function list() {
    return state().then((x) => Object.values(x.pending).map((x) => x.info))
  }
}
