import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { List } from "@opencode-ai/ui/list"
import { Icon } from "@opencode-ai/ui/icon"
import { Button } from "@opencode-ai/ui/button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Tabs } from "@opencode-ai/ui/tabs"
import { createMemo, createResource, createSignal, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import { useGlobalSDK } from "@/context/global-sdk"
import { usePlatform } from "@/context/platform"
import { addAuthInterceptor, useAuth } from "@/context/auth"

export type BranchGroup = "local" | "remote"

export type BranchDialogConfirm =
  | {
      kind: "pick"
      branch: {
        name: string
        group: BranchGroup
      }
    }
  | { kind: "skip" }

type BranchItem = {
  name: string
  group: BranchGroup
  current: boolean
}

function toItems(data: { local: string[]; remote: string[]; current?: string }): BranchItem[] {
  const result: BranchItem[] = []
  for (const name of data.local) {
    result.push({ name, group: "local", current: name === data.current })
  }
  for (const name of data.remote) {
    result.push({ name, group: "remote", current: false })
  }
  return result
}

export function DialogSelectBranch(props: {
  directory: string
  projectName: string
  /** e.g. progress ` (2/3)` for multi-project workspace */
  titleSuffix?: string
  onConfirm: (value: BranchDialogConfirm) => void
}) {
  const dialog = useDialog()
  const language = useLanguage()
  const globalSDK = useGlobalSDK()
  const platform = usePlatform()
  const auth = useAuth()
  const [refreshing, setRefreshing] = createSignal(false)

  const open = (dir: string) =>
    createOpencodeClient({
      baseUrl: globalSDK.url,
      fetch: platform.fetch,
      directory: dir,
      throwOnError: false,
      onClient: (c) => addAuthInterceptor(c, () => auth.token),
    })

  const load = async (dir: string, fresh?: boolean) => {
    const client = open(dir)
    const result = fresh
      ? await client.branch.refresh({ body_directory: dir }).catch(() => undefined)
      : await client.branch.list({ directory: dir })
    if (result?.data) return result.data
    if (fresh) {
      const fallback = await client.branch.list({ directory: dir })
      if (fallback.data) return fallback.data
      const e = fallback.error
      const msg =
        typeof e === "string"
          ? e
          : e && typeof e === "object" && "message" in e
            ? String((e as { message: unknown }).message)
            : language.t("common.requestFailed")
      throw new Error(msg)
    }
    const e = result?.error
    const msg =
      typeof e === "string"
        ? e
        : e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : language.t("common.requestFailed")
    throw new Error(msg)
  }

  const [raw, { refetch }] = createResource(
    () => props.directory,
    async (dir) => load(dir, true),
  )

  const items = createMemo(() => {
    const data = raw()
    if (!data) return [] as BranchItem[]
    return toItems(data)
  })
  const remoteItems = createMemo(() => items().filter((item) => item.group === "remote"))
  const localItems = createMemo(() => items().filter((item) => item.group === "local"))

  const refresh = async () => {
    if (raw.loading) return
    setRefreshing(true)
    await open(props.directory)
      .branch.refresh({ body_directory: props.directory })
      .catch(() => undefined)
    await refetch()
    setRefreshing(false)
  }

  const select = (item: BranchItem | undefined) => {
    if (!item) return
    props.onConfirm({ kind: "pick", branch: { name: item.name, group: item.group } })
    dialog.close()
  }

  const skip = () => {
    props.onConfirm({ kind: "skip" })
    dialog.close()
  }

  return (
    <Dialog title={`${language.t("dialog.branch.title")} — ${props.projectName}${props.titleSuffix ?? ""}`}>
      <div class="flex min-h-[360px] flex-col gap-2">
        <div class="flex shrink-0 justify-end gap-1">
          <Button variant="ghost" size="small" onClick={refresh} disabled={refreshing() || raw.loading}>
            <Show when={refreshing()}>
              <Spinner class="size-[14px]" />
            </Show>
            {refreshing() ? language.t("dialog.branch.refreshing") : language.t("dialog.branch.refresh")}
          </Button>
          <Button variant="ghost" size="small" onClick={skip}>
            {language.t("dialog.branch.skip")}
          </Button>
        </div>

        <Show when={raw.loading}>
          <div class="flex flex-1 flex-col items-center justify-center gap-2 p-8">
            <Spinner class="size-8" />
            <span class="text-14-regular text-text-weak">{language.t("common.loading")}</span>
          </div>
        </Show>

        <Show when={raw.error}>
          <div class="flex flex-1 flex-col items-center justify-center gap-3 p-6">
            <span class="text-center text-14-regular text-text-danger">{String(raw.error)}</span>
            <Button variant="secondary" onClick={() => refetch()}>
              {language.t("dialog.branch.refresh")}
            </Button>
          </div>
        </Show>

        <Show when={!raw.loading && !raw.error}>
          <Tabs defaultValue="remote" class="flex min-h-0 flex-1 flex-col">
            <Tabs.List class="mb-2 shrink-0">
              <Tabs.Trigger value="remote">{language.t("dialog.branch.remote")}</Tabs.Trigger>
              <Tabs.Trigger value="local">{language.t("dialog.branch.local")}</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="remote" class="flex min-h-0 flex-1">
              <List
                class="flex-1 min-h-0 [&_[data-slot=list-scroll]]:flex-1 [&_[data-slot=list-scroll]]:min-h-0"
                search={{
                  placeholder: language.t("dialog.branch.search.placeholder"),
                  autofocus: true,
                }}
                emptyMessage={language.t("dialog.branch.empty")}
                key={(x) => `${x.group}/${x.name}`}
                items={remoteItems()}
                filterKeys={["name"]}
                onSelect={select}
              >
                {(item) => (
                  <div class="flex w-full items-center gap-2">
                    <Icon name="branch" size="small" class="shrink-0 text-icon-base" />
                    <span class="min-w-0 flex-1 truncate text-left font-normal">{item.name}</span>
                  </div>
                )}
              </List>
            </Tabs.Content>
            <Tabs.Content value="local" class="flex min-h-0 flex-1">
              <List
                class="flex-1 min-h-0 [&_[data-slot=list-scroll]]:flex-1 [&_[data-slot=list-scroll]]:min-h-0"
                search={{
                  placeholder: language.t("dialog.branch.search.placeholder"),
                }}
                emptyMessage={language.t("dialog.branch.empty")}
                key={(x) => `${x.group}/${x.name}`}
                items={localItems()}
                filterKeys={["name"]}
                onSelect={select}
              >
                {(item) => (
                  <div class="flex w-full items-center gap-2">
                    <Icon name="branch" size="small" class="shrink-0 text-icon-base" />
                    <span class="min-w-0 flex-1 truncate text-left font-normal">{item.name}</span>
                    <Show when={item.current}>
                      <span class="shrink-0 text-12-regular text-text-weak">{language.t("dialog.branch.current")}</span>
                    </Show>
                  </div>
                )}
              </List>
            </Tabs.Content>
          </Tabs>
        </Show>
      </div>
    </Dialog>
  )
}
