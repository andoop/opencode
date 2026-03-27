import { createEffect, createMemo, createSignal, onCleanup, type Accessor } from "solid-js"
import { useLocal } from "@tui/context/local"
import { useSync } from "@tui/context/sync"
import { map, pipe, entries, sortBy } from "remeda"
import { DialogSelect, type DialogSelectRef, type DialogSelectOption } from "@tui/ui/dialog-select"
import { useTheme } from "../context/theme"
import { Keybind } from "@/util/keybind"
import { TextAttributes } from "@opentui/core"
import type { McpStatus } from "@opencode-ai/sdk/v2"

type Pending = {
  name: string
  action: "enable" | "disable"
}

function Status(props: { name: string; status: Accessor<McpStatus | undefined>; pending: Accessor<Pending | null> }) {
  const { theme } = useTheme()
  const pending = () => {
    const value = props.pending()
    if (value?.name !== props.name) return
    return value
  }
  if (pending()?.action === "enable") {
    return <span style={{ fg: theme.textMuted }}>⋯ Connecting</span>
  }
  if (pending()?.action === "disable") {
    return <span style={{ fg: theme.textMuted }}>⋯ Disabling</span>
  }
  if (props.status()?.status === "connected") {
    return <span style={{ fg: theme.success, attributes: TextAttributes.BOLD }}>✓ Enabled</span>
  }
  if (props.status()?.status === "failed") {
    return <span style={{ fg: theme.warning }}>! Failed</span>
  }
  if (props.status()?.status === "needs_auth") {
    return <span style={{ fg: theme.warning }}>! Auth</span>
  }
  if (props.status()?.status === "needs_client_registration") {
    return <span style={{ fg: theme.warning }}>! Setup</span>
  }
  return <span style={{ fg: theme.textMuted }}>○ Disabled</span>
}

export function DialogMcp() {
  const local = useLocal()
  const sync = useSync()
  const [, setRef] = createSignal<DialogSelectRef<unknown>>()
  const [pending, setPending] = createSignal<Pending | null>(null)
  const [visiblePending, setVisiblePending] = createSignal<Pending | null>(null)
  let timeout: ReturnType<typeof setTimeout> | undefined

  createEffect(() => {
    const value = pending()
    clearTimeout(timeout)
    if (!value) {
      setVisiblePending(null)
      return
    }
    timeout = setTimeout(() => {
      setVisiblePending(value)
    }, 150)
  })

  onCleanup(() => {
    clearTimeout(timeout)
  })

  const options = createMemo(() => {
    const mcpData = sync.data.mcp
    return pipe(
      mcpData ?? {},
      entries(),
      sortBy(([name]) => name),
      map(([name, status]) => ({
        value: name,
        title: name,
        description: status.status === "failed" ? "failed" : status.status,
        footer: <Status name={name} status={() => sync.data.mcp[name]} pending={visiblePending} />,
        category: undefined,
      })),
    )
  })

  const keybinds = createMemo(() => [
    {
      keybind: Keybind.parse("space")[0],
      title: "toggle",
      onTrigger: async (option: DialogSelectOption<string>) => {
        if (pending() !== null) return
        const current = sync.data.mcp[option.value]
        const action = current?.status === "connected" ? "disable" : "enable"

        setPending({ name: option.value, action })
        try {
          const next = await local.mcp.toggle(option.value)
          if (next) sync.set("mcp", option.value, next)
        } catch (error) {
          console.error("Failed to toggle MCP:", error)
        } finally {
          setPending(null)
        }
      },
    },
  ])

  return (
    <DialogSelect
      ref={setRef}
      title="MCPs"
      options={options()}
      keybind={keybinds()}
      onSelect={(option) => {
        // Don't close on select, only on escape
      }}
    />
  )
}
