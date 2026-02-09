import { createOpencodeClient } from "@opencode-ai/sdk/v2/client"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { batch, createEffect, createMemo, createSignal, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { usePlatform } from "@/context/platform"
import { Persist, persisted } from "@/utils/persist"

type StoredProject = { worktree: string; expanded: boolean }

export function normalizeServerUrl(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return
  const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`
  return withProtocol.replace(/\/+$/, "")
}

export function serverDisplayName(url: string) {
  if (!url) return ""
  return url.replace(/^https?:\/\//, "").replace(/\/+$/, "")
}

function projectsKey(url: string) {
  if (!url) return ""
  const host = url.replace(/^https?:\/\//, "").split(":")[0]
  if (host === "localhost" || host === "127.0.0.1") return "local"
  return url
}

export const { use: useServer, provider: ServerProvider } = createSimpleContext({
  name: "Server",
  init: (props: { defaultUrl: string }) => {
    const platform = usePlatform()
    
    // Helper to flush storage if available (for desktop app with debounced writes)
    const flushStorage = () => {
      if (platform.platform === "desktop" && platform.storage) {
        try {
          const storage = platform.storage("opencode.global.dat")
          if (storage && typeof (storage as unknown as { flush?: () => Promise<void> }).flush === "function") {
            void (storage as unknown as { flush: () => Promise<void> }).flush()
          }
        } catch {
          // Ignore errors
        }
      }
    }

    const [store, setStore, _, ready] = persisted(
      Persist.global("server", ["server.v3"]),
      createStore({
        list: [] as string[],
        projects: {} as Record<string, StoredProject[]>,
        lastProject: {} as Record<string, string>,
      }),
    )

    const [state, setState] = createStore({
      active: "",
      healthy: undefined as boolean | undefined,
    })

    const healthy = () => state.healthy

    function setActive(input: string) {
      const url = normalizeServerUrl(input)
      if (!url) return
      setState("active", url)
    }

    function add(input: string) {
      const url = normalizeServerUrl(input)
      if (!url) return

      const fallback = normalizeServerUrl(props.defaultUrl)
      if (fallback && url === fallback) {
        setState("active", url)
        return
      }

      batch(() => {
        if (!store.list.includes(url)) {
          setStore("list", store.list.length, url)
        }
        setState("active", url)
      })
    }

    function remove(input: string) {
      const url = normalizeServerUrl(input)
      if (!url) return

      const list = store.list.filter((x) => x !== url)
      const next = state.active === url ? (list[0] ?? normalizeServerUrl(props.defaultUrl) ?? "") : state.active

      batch(() => {
        setStore("list", list)
        setState("active", next)
      })
    }

    createEffect(() => {
      if (!ready()) return
      if (state.active) return
      const url = normalizeServerUrl(props.defaultUrl)
      if (!url) return
      setState("active", url)
    })

    const isReady = createMemo(() => ready() && !!state.active)

    const check = (url: string) => {
      const signal = (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout?.(3000)
      const sdk = createOpencodeClient({
        baseUrl: url,
        fetch: platform.fetch,
        signal,
      })
      return sdk.global
        .health()
        .then((x) => x.data?.healthy === true)
        .catch(() => false)
    }

    createEffect(() => {
      const url = state.active
      if (!url) return

      setState("healthy", undefined)

      let alive = true
      let busy = false

      const run = () => {
        if (busy) return
        busy = true
        void check(url)
          .then((next) => {
            if (!alive) return
            setState("healthy", next)
          })
          .finally(() => {
            busy = false
          })
      }

      run()
      const interval = setInterval(run, 10_000)

      onCleanup(() => {
        alive = false
        clearInterval(interval)
      })
    })

    // User ID suffix for per-user project isolation in multi-user mode
    const [userID, setUserID] = createSignal("")
    const origin = createMemo(() => {
      const key = projectsKey(state.active)
      const uid = userID()
      return uid ? `${key}:${uid}` : key
    })
    const projectsList = createMemo(() => store.projects[origin()] ?? [])
    const isLocal = createMemo(() => origin().startsWith("local"))

    return {
      ready: isReady,
      healthy,
      isLocal,
      setUserID,
      get url() {
        return state.active
      },
      get name() {
        return serverDisplayName(state.active)
      },
      get list() {
        return store.list
      },
      setActive,
      add,
      remove,
      projects: {
        list: () => projectsList(),
        open(directory: string) {
          const key = origin()
          if (!key) return
          const current = store.projects[key] ?? []
          if (current.find((x) => x.worktree === directory)) return
          setStore("projects", key, [{ worktree: directory, expanded: true }, ...current])
        },
        close(directory: string) {
          const key = origin()
          if (!key) return
          const current = store.projects[key] ?? []
          const filtered = current.filter((x) => x.worktree !== directory)
          // Also clear lastProject if it matches the closed directory
          if (store.lastProject[key] === directory) {
            setStore("lastProject", key, undefined as unknown as string)
          }
          // Force immediate write to localStorage for web platform BEFORE setStore
          // This ensures makePersisted reads the updated value on next initialization
          // Since web platform uses SyncStorage, we need to ensure the write happens synchronously
          // by directly accessing the storage API used by makePersisted
          // Also need to clear any legacy keys that might be restored on next load
          if (platform.platform === "web" && !platform.storage) {
            try {
              // Web platform, use localStorage directly
              // The storage key format is: `${GLOBAL_STORAGE}:${config.key}` = `opencode.global.dat:server`
              const storageKey = `opencode.global.dat:server`
              // Also clear legacy keys to prevent them from being restored
              const legacyKeys = ["server.v3", "server.v2", "server.v1", "server"]
              for (const legacyKey of legacyKeys) {
                try {
                  localStorage.removeItem(legacyKey)
                } catch {
                  // Ignore errors
                }
              }
              // Read current value from localStorage to ensure we have the latest state
              const currentRaw = localStorage.getItem(storageKey)
              if (currentRaw) {
                try {
                  const currentParsed = JSON.parse(currentRaw)
                  // Update the projects for the current key
                  const updatedProjects = {
                    ...currentParsed.projects,
                    [key]: filtered,
                  }
                  // Also clear lastProject if it matches the closed directory
                  const updatedLastProject = {
                    ...currentParsed.lastProject,
                    [key]: currentParsed.lastProject[key] === directory ? undefined : currentParsed.lastProject[key],
                  }
                  const updatedStore = {
                    ...currentParsed,
                    projects: updatedProjects,
                    lastProject: updatedLastProject,
                  }
                  const updatedValue = JSON.stringify(updatedStore)
                  // Write to localStorage
                  localStorage.setItem(storageKey, updatedValue)
                } catch {
                  // Ignore parse errors
                }
              } else {
                // If no current value, create a new store with the filtered projects
                // Also clear lastProject if it matches the closed directory
                const currentLastProject = store.lastProject[key]
                const newStore = {
                  list: [] as string[],
                  projects: {
                    [key]: filtered,
                  } as Record<string, StoredProject[]>,
                  lastProject: {
                    ...store.lastProject,
                    [key]: currentLastProject === directory ? undefined : currentLastProject,
                  } as Record<string, string>,
                }
                const newValue = JSON.stringify(newStore)
                localStorage.setItem(storageKey, newValue)
              }
            } catch {
              // Ignore errors
            }
          }
          // Now call setStore after localStorage has been updated
          setStore(
            "projects",
            key,
            filtered,
          )
          // Force flush storage if available (for desktop app with debounced writes)
          flushStorage()
        },
        expand(directory: string) {
          const key = origin()
          if (!key) return
          const current = store.projects[key] ?? []
          const index = current.findIndex((x) => x.worktree === directory)
          if (index !== -1) setStore("projects", key, index, "expanded", true)
        },
        collapse(directory: string) {
          const key = origin()
          if (!key) return
          const current = store.projects[key] ?? []
          const index = current.findIndex((x) => x.worktree === directory)
          if (index !== -1) setStore("projects", key, index, "expanded", false)
        },
        move(directory: string, toIndex: number) {
          const key = origin()
          if (!key) return
          const current = store.projects[key] ?? []
          const fromIndex = current.findIndex((x) => x.worktree === directory)
          if (fromIndex === -1 || fromIndex === toIndex) return
          const result = [...current]
          const [item] = result.splice(fromIndex, 1)
          result.splice(toIndex, 0, item)
          setStore("projects", key, result)
        },
        last() {
          const key = origin()
          if (!key) return
          return store.lastProject[key]
        },
        touch(directory: string) {
          const key = origin()
          if (!key) return
          setStore("lastProject", key, directory)
        },
      },
    }
  },
})
