import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { TextField } from "@opencode-ai/ui/text-field"
import { Switch } from "@opencode-ai/ui/switch"
import { showToast } from "@opencode-ai/ui/toast"
import { createStore } from "solid-js/store"
import { useGlobalSDK } from "@/context/global-sdk"
import { useLanguage } from "@/context/language"
import type { McpConfigRemote } from "@opencode-ai/sdk/v2/client"

type Props = {
  scope: "project" | "global"
  directory?: string
  name?: string
  config?: McpConfigRemote
  onSaved?: () => Promise<void> | void
}

export function DialogEditMcp(props: Props) {
  const dialog = useDialog()
  const sdk = useGlobalSDK()
  const language = useLanguage()
  const editing = () => !!props.name

  const [store, setStore] = createStore({
    name: props.name ?? "",
    url: props.config?.url ?? "",
    enabled: props.config?.enabled ?? true,
    saving: false,
    errors: {
      name: undefined as string | undefined,
      url: undefined as string | undefined,
    },
  })

  const validate = () => {
    const name = store.name.trim()
    const url = store.url.trim()
    const nameError = !name ? language.t("settings.mcp.validation.nameRequired") : undefined
    const urlError = !url
      ? language.t("settings.mcp.validation.urlRequired")
      : !URL.canParse(url)
        ? language.t("settings.mcp.validation.urlInvalid")
        : undefined

    setStore("errors", {
      name: nameError,
      url: urlError,
    })

    if (nameError || urlError) return
    return {
      name,
      config: {
        url,
        enabled: store.enabled,
      },
    }
  }

  const save = async (event: SubmitEvent) => {
    event.preventDefault()
    if (store.saving) return
    const result = validate()
    if (!result) return
    setStore("saving", true)

    try {
      if (editing()) {
        await sdk.client.mcp.config.update({
          directory: props.directory || undefined,
          scope: props.scope,
          name: props.name!,
          config: result.config,
        })
      } else {
        await sdk.client.mcp.config.create({
          directory: props.directory || undefined,
          scope: props.scope,
          name: result.name,
          config: result.config,
        })
      }

      await props.onSaved?.()
      dialog.close()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t(editing() ? "settings.mcp.toast.updated" : "settings.mcp.toast.created"),
      })
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setStore("saving", false)
    }
  }

  return (
    <Dialog title={language.t(editing() ? "settings.mcp.form.edit" : "settings.mcp.form.create")}>
      <form onSubmit={save} class="flex flex-col gap-6 p-6 pt-0">
        <div class="flex flex-col gap-4">
          <TextField
            autofocus={!editing()}
            readOnly={editing()}
            label={language.t("settings.mcp.form.name")}
            placeholder={language.t("settings.mcp.form.name.placeholder")}
            value={store.name}
            onChange={(value) => setStore("name", value)}
            validationState={store.errors.name ? "invalid" : undefined}
            error={store.errors.name}
          />
          <TextField
            autofocus={editing()}
            label={language.t("settings.mcp.form.url")}
            placeholder={language.t("settings.mcp.form.url.placeholder")}
            value={store.url}
            onChange={(value) => setStore("url", value)}
            validationState={store.errors.url ? "invalid" : undefined}
            error={store.errors.url}
          />
          <div class="flex items-center justify-between gap-4 rounded-lg bg-surface-raised-base px-4 py-3">
            <div class="flex flex-col gap-1">
              <span class="text-14-medium text-text-strong">{language.t("settings.mcp.form.enabled")}</span>
              <span class="text-12-regular text-text-weak">{language.t("settings.mcp.form.enabled.description")}</span>
            </div>
            <Switch checked={store.enabled} onChange={(value) => setStore("enabled", value)} hideLabel>
              {language.t("settings.mcp.form.enabled")}
            </Switch>
          </div>
        </div>
        <div class="flex items-center justify-end gap-2">
          <Button type="button" size="large" variant="ghost" onClick={() => dialog.close()}>
            {language.t("common.cancel")}
          </Button>
          <Button type="submit" size="large" variant="primary" disabled={store.saving}>
            {store.saving
              ? language.t("common.saving")
              : language.t(editing() ? "common.save" : "settings.mcp.action.add")}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
