import "@/index.css"
import { ErrorBoundary, Show, lazy, type ParentProps, createEffect, createSignal, createMemo } from "solid-js"
import { Router, Route, Navigate, useNavigate, useLocation } from "@solidjs/router"
import { MetaProvider } from "@solidjs/meta"
import { Font } from "@opencode-ai/ui/font"
import { MarkedProvider } from "@opencode-ai/ui/context/marked"
import { DiffComponentProvider } from "@opencode-ai/ui/context/diff"
import { CodeComponentProvider } from "@opencode-ai/ui/context/code"
import { I18nProvider } from "@opencode-ai/ui/context"
import { Diff } from "@opencode-ai/ui/diff"
import { Code } from "@opencode-ai/ui/code"
import { ThemeProvider } from "@opencode-ai/ui/theme"
import { GlobalSyncProvider } from "@/context/global-sync"
import { PermissionProvider } from "@/context/permission"
import { LayoutProvider } from "@/context/layout"
import { GlobalSDKProvider } from "@/context/global-sdk"
import { normalizeServerUrl, ServerProvider, useServer } from "@/context/server"
import { SettingsProvider } from "@/context/settings"
import { TerminalProvider } from "@/context/terminal"
import { PromptProvider } from "@/context/prompt"
import { FileProvider } from "@/context/file"
import { CommentsProvider } from "@/context/comments"
import { NotificationProvider } from "@/context/notification"
import { ModelsProvider } from "@/context/models"
import { DialogProvider } from "@opencode-ai/ui/context/dialog"
import { CommandProvider } from "@/context/command"
import { LanguageProvider, useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { HighlightsProvider } from "@/context/highlights"
import { AuthProvider, useAuth } from "@/context/auth"
import Layout from "@/pages/layout"
import DirectoryLayout from "@/pages/directory-layout"
import { ErrorPage } from "./pages/error"
import { Suspense } from "solid-js"

const Home = lazy(() => import("@/pages/home"))
const Session = lazy(() => import("@/pages/session"))
const Login = lazy(() => import("@/pages/login"))
const Register = lazy(() => import("@/pages/register"))
const Admin = lazy(() => import("@/pages/admin"))
const AdminConfig = lazy(() => import("@/pages/admin/config"))
const AdminUsers = lazy(() => import("@/pages/admin/users"))
const AdminProjects = lazy(() => import("@/pages/admin/projects"))
const AdminAudit = lazy(() => import("@/pages/admin/audit"))
const Loading = () => <div class="size-full" />

function AuthGuard(props: ParentProps) {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  createEffect(() => {
    // Don't redirect if already on login page
    if (location.pathname === "/login" || location.pathname === "/register") return

    if (auth.isMultiUserEnabled && !auth.loading && !auth.isAuthenticated) {
      navigate("/login")
    }
  })

  // Don't render protected content if on login page
  if (location.pathname === "/login" || location.pathname === "/register") {
    return null
  }

  // Wait for auth to finish loading before rendering protected content
  // If still loading, show loading state
  // If multi-user is disabled, render children immediately
  // If multi-user is enabled, only render children when authenticated
  return (
    <Show when={!auth.loading && (!auth.isMultiUserEnabled || auth.isAuthenticated)} fallback={<Loading />}>
      {props.children}
    </Show>
  )
}

function AdminGuard(props: ParentProps) {
  const auth = useAuth()
  const navigate = useNavigate()

  createEffect(() => {
    if (!auth.loading && !auth.isAdmin) {
      navigate("/")
    }
  })

  return (
    <Show when={auth.isAdmin} fallback={<Loading />}>
      {props.children}
    </Show>
  )
}

function UiI18nBridge(props: ParentProps) {
  const language = useLanguage()
  return <I18nProvider value={{ locale: language.locale, t: language.t }}>{props.children}</I18nProvider>
}

declare global {
  interface Window {
    __OPENCODE__?: { updaterEnabled?: boolean; serverPassword?: string; deepLinks?: string[] }
  }
}

function MarkedProviderWithNativeParser(props: ParentProps) {
  const platform = usePlatform()
  return <MarkedProvider nativeParser={platform.parseMarkdown}>{props.children}</MarkedProvider>
}

export function AppBaseProviders(props: ParentProps) {
  return (
    <MetaProvider>
      <Font />
      <ThemeProvider>
        <LanguageProvider>
          <UiI18nBridge>
            <ErrorBoundary fallback={(error) => <ErrorPage error={error} />}>
              <DialogProvider>
                <MarkedProviderWithNativeParser>
                  <DiffComponentProvider component={Diff}>
                    <CodeComponentProvider component={Code}>{props.children}</CodeComponentProvider>
                  </DiffComponentProvider>
                </MarkedProviderWithNativeParser>
              </DialogProvider>
            </ErrorBoundary>
          </UiI18nBridge>
        </LanguageProvider>
      </ThemeProvider>
    </MetaProvider>
  )
}

function ServerKey(props: ParentProps) {
  const server = useServer()
  return (
    <Show when={server.url} keyed>
      {props.children}
    </Show>
  )
}

export function AppInterface(props: { defaultUrl?: string }) {
  const platform = usePlatform()

  const stored = (() => {
    if (platform.platform !== "web") return
    const result = platform.getDefaultServerUrl?.()
    if (result instanceof Promise) return
    if (!result) return
    return normalizeServerUrl(result)
  })()

  const defaultServerUrl = () => {
    if (props.defaultUrl) return props.defaultUrl
    if (stored) return stored
    if (location.hostname.includes("opencode.ai")) return "http://localhost:4096"
    if (import.meta.env.DEV) {
      // 使用访问的主机名而不是固定的 localhost，这样从其他设备访问也能工作
      const host = import.meta.env.VITE_OPENCODE_SERVER_HOST ?? window.location.hostname
      const port = import.meta.env.VITE_OPENCODE_SERVER_PORT ?? "4096"
      return `http://${host}:${port}`
    }

    return window.location.origin
  }

  return (
    <ServerProvider defaultUrl={defaultServerUrl()}>
      <ServerKey>
        <AuthProvider>
          <GlobalSDKProvider>
            <GlobalSyncProvider>
              <Router
                root={(props) => {
                  const location = useLocation()
                  const isAuthPage = createMemo(
                    () => location.pathname === "/login" || location.pathname === "/register",
                  )

                  // Auth pages should not use Layout
                  return (
                    <Show when={!isAuthPage()} fallback={<>{props.children}</>}>
                      <SettingsProvider>
                        <PermissionProvider>
                          <LayoutProvider>
                            <NotificationProvider>
                              <ModelsProvider>
                                <CommandProvider>
                                  <HighlightsProvider>
                                    <Layout>{props.children}</Layout>
                                  </HighlightsProvider>
                                </CommandProvider>
                              </ModelsProvider>
                            </NotificationProvider>
                          </LayoutProvider>
                        </PermissionProvider>
                      </SettingsProvider>
                    </Show>
                  )
                }}
              >
                <Route
                  path="/login"
                  component={() => (
                    <Suspense fallback={<Loading />}>
                      <Login />
                    </Suspense>
                  )}
                />
                <Route
                  path="/register"
                  component={() => (
                    <Suspense fallback={<Loading />}>
                      <Register />
                    </Suspense>
                  )}
                />
                <Route
                  path="/admin"
                  component={(props) => (
                    <AdminGuard>
                      <Suspense fallback={<Loading />}>
                        <Admin>{props.children}</Admin>
                      </Suspense>
                    </AdminGuard>
                  )}
                >
                  <Route path="/" component={() => <Navigate href="config" />} />
                  <Route
                    path="config"
                    component={() => (
                      <Suspense fallback={<Loading />}>
                        <AdminConfig />
                      </Suspense>
                    )}
                  />
                  <Route
                    path="users"
                    component={() => (
                      <Suspense fallback={<Loading />}>
                        <AdminUsers />
                      </Suspense>
                    )}
                  />
                  <Route
                    path="projects"
                    component={() => (
                      <Suspense fallback={<Loading />}>
                        <AdminProjects />
                      </Suspense>
                    )}
                  />
                  <Route
                    path="audit"
                    component={() => (
                      <Suspense fallback={<Loading />}>
                        <AdminAudit />
                      </Suspense>
                    )}
                  />
                </Route>
                <Route
                  path="/"
                  component={() => (
                    <AuthGuard>
                      <Suspense fallback={<Loading />}>
                        <Home />
                      </Suspense>
                    </AuthGuard>
                  )}
                />
                <Route path="/:dir" component={DirectoryLayout}>
                  <Route path="/" component={() => <Navigate href="session" />} />
                  <Route
                    path="/session/:id?"
                    component={(p) => (
                      <AuthGuard>
                        <Show when={p.params.id ?? "new"}>
                          <TerminalProvider>
                            <FileProvider>
                              <PromptProvider>
                                <CommentsProvider>
                                  <Suspense fallback={<Loading />}>
                                    <Session />
                                  </Suspense>
                                </CommentsProvider>
                              </PromptProvider>
                            </FileProvider>
                          </TerminalProvider>
                        </Show>
                      </AuthGuard>
                    )}
                  />
                </Route>
              </Router>
            </GlobalSyncProvider>
          </GlobalSDKProvider>
        </AuthProvider>
      </ServerKey>
    </ServerProvider>
  )
}
