import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { Icon } from "@opencode-ai/ui/icon"
import { Button } from "@opencode-ai/ui/button"
import { Collapsible } from "@opencode-ai/ui/collapsible"
import { getDirectory, getFilename } from "@opencode-ai/util/path"
import { createMemo, createResource, createSignal, For, Show } from "solid-js"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { useLanguage } from "@/context/language"

interface DialogSelectDirectoryProps {
  title?: string
  multiple?: boolean
  onSelect: (result: string | string[] | null) => void
}

type DirectoryNode = {
  path: string
  name: string
  expanded: boolean
  loading: boolean
  children: DirectoryNode[]
}

export function DialogSelectDirectory(props: DialogSelectDirectoryProps) {
  const sync = useGlobalSync()
  const sdk = useGlobalSDK()
  const dialog = useDialog()
  const language = useLanguage()

  const [searchQuery, setSearchQuery] = createSignal("")
  const [selectedPaths, setSelectedPaths] = createSignal<Set<string>>(new Set())
  const [expandedPaths, setExpandedPaths] = createSignal<Set<string>>(new Set([""]))
  const [loadingPaths, setLoadingPaths] = createSignal<Set<string>>(new Set())
  const [directoryCache, setDirectoryCache] = createSignal<Map<string, DirectoryNode[]>>(new Map())
  const [currentPath, setCurrentPath] = createSignal<string>("")

  const missingBase = createMemo(() => !(sync.data.path.home || sync.data.path.directory))

  const [fallbackPath] = createResource(
    () => (missingBase() ? true : undefined),
    async () => {
      return sdk.client.path
        .get()
        .then((x) => x.data)
        .catch(() => undefined)
    },
    { initialValue: undefined },
  )

  const home = createMemo(() => sync.data.path.home || fallbackPath()?.home || "")

  const rootPath = createMemo(
    () => sync.data.path.home || sync.data.path.directory || fallbackPath()?.home || fallbackPath()?.directory || "/",
  )

  function normalize(input: string) {
    const v = input.replaceAll("\\", "/")
    if (v.startsWith("//") && !v.startsWith("///")) return "//" + v.slice(2).replace(/\/+/g, "/")
    return v.replace(/\/+/g, "/")
  }

  function trimTrailing(input: string) {
    const v = normalize(input)
    if (v === "/") return v
    if (v === "//") return v
    if (/^[A-Za-z]:\/$/.test(v)) return v
    return v.replace(/\/+$/, "")
  }

  function join(base: string, rel: string) {
    const b = trimTrailing(base)
    const r = trimTrailing(rel).replace(/^\/+/, "")
    if (!b) return r
    if (!r) return b
    if (b.endsWith("/")) return b + r
    return b + "/" + r
  }

  function parentOf(input: string) {
    const v = trimTrailing(input)
    if (v === "/") return v
    if (v === "//") return v
    if (/^[A-Za-z]:\/$/.test(v)) return v

    const i = v.lastIndexOf("/")
    if (i <= 0) return "/"
    if (i === 2 && /^[A-Za-z]:/.test(v)) return v.slice(0, 3)
    return v.slice(0, i)
  }

  function displayPath(path: string) {
    const h = home()
    if (!h) return path
    const hn = trimTrailing(h)
    const full = trimTrailing(path)
    const lc = full.toLowerCase()
    const hc = hn.toLowerCase()
    if (lc === hc) return "~"
    if (lc.startsWith(hc + "/")) return "~" + full.slice(hn.length)
    return full
  }

  async function loadDirectory(path: string): Promise<DirectoryNode[]> {
    const cached = directoryCache().get(path)
    if (cached) return cached

    const key = trimTrailing(path)
    setLoadingPaths((prev) => new Set(prev).add(key))

    try {
      const nodes = await sdk.client.browse
        .list({
          directory: key,
          path: "",
          type: "directory",
          limit: 200,
        })
        .then((x) => x.data ?? [])
      const dirs = nodes.map((n) => ({
        path: trimTrailing(normalize(n.absolute)),
        name: n.name,
        expanded: false,
        loading: false,
        children: [],
      }))

      setDirectoryCache((prev) => {
        const next = new Map(prev)
        next.set(key, dirs)
        return next
      })
      return dirs
    } catch (err) {
      console.error("Failed to load directory:", err)
      return []
    } finally {
      setLoadingPaths((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  const [rootDirectories] = createResource(
    () => rootPath(),
    async (path) => {
      return await loadDirectory(path)
    },
  )

  async function toggleExpand(path: string) {
    const key = trimTrailing(path)
    const expanded = expandedPaths()
    const isExpanded = expanded.has(key)

    if (isExpanded) {
      setExpandedPaths((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    } else {
      setExpandedPaths((prev) => new Set(prev).add(key))
      // 加载子目录
      const children = await loadDirectory(key)
      // 如果有子目录，自动展开第一个（可选）
      if (children.length > 0 && children.length === 1) {
        setExpandedPaths((prev) => new Set(prev).add(children[0].path))
      }
    }
  }

  function toggleSelect(path: string) {
    if (!props.multiple) {
      setSelectedPaths(new Set([path]))
      return
    }

    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  function submit(path?: string) {
    if (path) {
      props.onSelect(props.multiple ? [path] : path)
      dialog.close()
      return
    }

    const selected = Array.from(selectedPaths())
    props.onSelect(props.multiple ? (selected.length > 0 ? selected : null) : (selected[0] ?? null))
    dialog.close()
  }

  function cancel() {
    props.onSelect(null)
    dialog.close()
  }

  function getBreadcrumbs(path: string): string[] {
    const parts: string[] = []
    let current = trimTrailing(path)
    while (current && current !== "/" && current !== rootPath()) {
      parts.unshift(current)
      current = parentOf(current)
    }
    if (rootPath() !== "/") {
      parts.unshift(rootPath())
    }
    return parts
  }

  function DirectoryItem(props: { path: string; level: number }) {
    const path = () => props.path
    const name = () => {
      const p = path()
      const root = rootPath()
      if (p === root) return displayPath(root)
      return getFilename(p)
    }
    const isExpanded = () => expandedPaths().has(path())
    const isLoading = () => loadingPaths().has(path())
    const isSelected = () => selectedPaths().has(path())
    const children = createMemo(() => directoryCache().get(path()) ?? [])
    const canExpand = () => isLoading() || isExpanded() || !directoryCache().has(path()) || children().length > 0

    return (
      <div>
        <div
          classList={{
            "flex items-center gap-x-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-surface-raised-base-hover transition-colors": true,
            "bg-surface-base-active": isSelected(),
          }}
          style={`padding-left: ${8 + props.level * 16}px`}
          onClick={(e) => {
            e.stopPropagation()
            toggleSelect(path())
          }}
          onDblClick={(e) => {
            e.stopPropagation()
            toggleExpand(path())
          }}
        >
          <button
            class="shrink-0 w-4 h-4 flex items-center justify-center"
            onClick={(e) => {
              e.stopPropagation()
              toggleExpand(path())
            }}
          >
            <Show when={isLoading()}>
              <div class="size-3 border-2 border-icon-weak border-t-transparent rounded-full animate-spin" />
            </Show>
            <Show when={!isLoading() && canExpand()} fallback={<div class="w-4" />}>
              <Icon name={isExpanded() ? "chevron-down" : "chevron-right"} class="size-3 text-icon-weak" />
            </Show>
          </button>
          <FileIcon node={{ path: path(), type: "directory" }} class="shrink-0 size-4" />
          <span class="flex-1 text-14-regular text-text-strong truncate">{name()}</span>
          <Show when={multiple() && isSelected()}>
            <Icon name="check" class="size-4 text-icon-success-base" />
          </Show>
        </div>
        <Show when={isExpanded()}>
          <Collapsible open={isExpanded()}>
            <Collapsible.Content>
              <For each={children()}>{(child) => <DirectoryItem path={child.path} level={props.level + 1} />}</For>
            </Collapsible.Content>
          </Collapsible>
        </Show>
      </div>
    )
  }

  const multiple = () => props.multiple ?? false

  // 搜索模式
  const [searchResults] = createResource(
    () => searchQuery().trim(),
    async (query) => {
      if (!query) return []

      try {
        const results = await sdk.client.find
          .files({ directory: rootPath(), query, type: "directory", limit: 100 })
          .then((x) => x.data ?? [])
          .catch(() => [])

        return results.map((rel) => join(rootPath(), rel))
      } catch {
        return []
      }
    },
  )

  return (
    <Dialog title={props.title ?? language.t("workspace.new")} class="!max-w-2xl">
      <div class="flex flex-col gap-3 h-[500px]">
        {/* 搜索框 */}
        <div class="flex items-center gap-2">
          <input
            type="text"
            placeholder={language.t("dialog.directory.search.placeholder")}
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
            class="flex-1 px-3 py-2 rounded-md border border-border-base bg-background-base text-14-regular text-text-strong focus:outline-none focus:ring-2 focus:ring-border-strong-base"
          />
          <Show when={selectedPaths().size > 0}>
            <Button variant="primary" onClick={() => submit()}>
              {language.t("common.submit")} ({selectedPaths().size})
            </Button>
          </Show>
          <Button variant="ghost" onClick={cancel}>
            {language.t("common.cancel")}
          </Button>
        </div>

        {/* 面包屑导航 */}
        <Show when={currentPath() && currentPath() !== rootPath()}>
          <div class="flex items-center gap-1 text-12-regular text-text-weak">
            <button
              onClick={() => {
                setCurrentPath("")
                setExpandedPaths(new Set([""]))
              }}
              class="hover:text-text-strong"
            >
              {displayPath(rootPath())}
            </button>
            <For each={getBreadcrumbs(currentPath()).slice(1)}>
              {(part) => (
                <>
                  <Icon name="chevron-right" class="size-3" />
                  <button
                    onClick={() => {
                      setCurrentPath(part)
                      setExpandedPaths((prev) => new Set(prev).add(part))
                    }}
                    class="hover:text-text-strong"
                  >
                    {getFilename(part)}
                  </button>
                </>
              )}
            </For>
          </div>
        </Show>

        {/* 目录树或搜索结果 */}
        <div class="flex-1 overflow-y-auto border border-border-base rounded-md bg-background-frame">
          <Show
            when={searchQuery().trim()}
            fallback={
              <Show when={rootDirectories()}>
                <div class="p-2">
                  <For each={rootDirectories()}>{(dir) => <DirectoryItem path={dir.path} level={0} />}</For>
                </div>
              </Show>
            }
          >
            <Show when={searchResults()}>
              <div class="p-2">
                <For each={searchResults()}>
                  {(path) => (
                    <div
                      classList={{
                        "flex items-center gap-x-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-surface-raised-base-hover transition-colors": true,
                        "bg-surface-base-active": selectedPaths().has(path),
                      }}
                      onClick={() => toggleSelect(path)}
                      onDblClick={() => submit(path)}
                    >
                      <FileIcon node={{ path, type: "directory" }} class="shrink-0 size-4" />
                      <span class="flex-1 text-14-regular text-text-strong">{displayPath(path)}</span>
                      <Show when={selectedPaths().has(path)}>
                        <Icon name="check" class="size-4 text-icon-success-base" />
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </Dialog>
  )
}
