import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { List } from "@opencode-ai/ui/list"
import { Icon } from "@opencode-ai/ui/icon"
import { Button } from "@opencode-ai/ui/button"
import { Spinner } from "@opencode-ai/ui/spinner"
import { createEffect, createSignal, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import { useGlobalSDK } from "@/context/global-sdk"
import { usePlatform } from "@/context/platform"
import { addAuthInterceptor, useAuth } from "@/context/auth"

type BranchItem = {
  name: string
  group: "local" | "remote"
  current: boolean
}

export function DialogSelectBranch(props: {
  directory: string
  projectName: string
  onSelect: (branch: string | null) => void
}) {
  const dialog = useDialog()
  const language = useLanguage()
  const globalSDK = useGlobalSDK()
  const platform = usePlatform()
  const auth = useAuth()

  const [items, setItems] = createSignal<BranchItem[]>([])
  const [refreshing, setRefreshing] = createSignal(false)

  const client = createOpencodeClient({
    baseUrl: globalSDK.url,
    fetch: platform.fetch,
    directory: props.directory,
    onClient: (c) => addAuthInterceptor(c, () => auth.token),
  })

  const load = (data: { local: string[]; remote: string[]; current?: string }) => {
    const seen = new Set<string>()
    const result: BranchItem[] = []
    for (const name of data.local) {
      seen.add(name)
      result.push({ name, group: "local", current: name === data.current })
    }
    for (const name of data.remote) {
      if (seen.has(name)) continue
      result.push({ name, group: "remote", current: false })
    }
    setItems(result)
  }

  createEffect(() => {
    client.branch.list({ directory: props.directory }).then((x) => {
      if (x.data) load(x.data)
    })
  })

  const refresh = async () => {
    setRefreshing(true)
    const result = await client.branch
      .refresh({ body_directory: props.directory })
      .catch(() => undefined)
    if (result?.data) load(result.data)
    setRefreshing(false)
  }

  const select = (item: BranchItem | undefined) => {
    if (!item) return
    props.onSelect(item.name)
    dialog.close()
  }

  const skip = () => {
    props.onSelect(null)
    dialog.close()
  }

  return (
    <Dialog title={`${language.t("dialog.branch.title")} — ${props.projectName}`}>
      <List
        class="flex-1 min-h-0 [&_[data-slot=list-scroll]]:flex-1 [&_[data-slot=list-scroll]]:min-h-0"
        search={{
          placeholder: language.t("dialog.branch.search.placeholder"),
          autofocus: true,
          action: (
            <div class="flex items-center gap-1">
              <Button variant="ghost" size="small" onClick={refresh} disabled={refreshing()}>
                <Show when={refreshing()}>
                  <Spinner class="size-[14px]" />
                </Show>
                {refreshing() ? language.t("dialog.branch.refreshing") : language.t("dialog.branch.refresh")}
              </Button>
              <Button variant="ghost" size="small" onClick={skip}>
                {language.t("dialog.branch.skip")}
              </Button>
            </div>
          ),
        }}
        emptyMessage={language.t("dialog.branch.empty")}
        key={(x) => `${x.group}/${x.name}`}
        items={items}
        filterKeys={["name"]}
        groupBy={(x) =>
          x.group === "local" ? language.t("dialog.branch.local") : language.t("dialog.branch.remote")
        }
        onSelect={select}
      >
        {(item) => (
          <div class="w-full flex items-center gap-2">
            <Icon name="branch" size="small" class="shrink-0 text-icon-base" />
            <span class="truncate flex-1 min-w-0 text-left font-normal">{item.name}</span>
            <Show when={item.current}>
              <span class="text-12-regular text-text-weak shrink-0">{language.t("dialog.branch.current")}</span>
            </Show>
          </div>
        )}
      </List>
    </Dialog>
  )
}
