import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { TextField } from "@opencode-ai/ui/text-field"
import { Switch } from "@opencode-ai/ui/switch"
import { showToast } from "@opencode-ai/ui/toast"
import { Icon } from "@opencode-ai/ui/icon"
import { Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useGlobalSDK } from "@/context/global-sdk"
import { useLanguage } from "@/context/language"

type CommandConfig = {
  template: string
  description?: string
  agent?: string
  model?: string
  subtask?: boolean
}

type Props = {
  name?: string
  config?: CommandConfig
  onSaved?: () => Promise<void> | void
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

function parseMarkdown(raw: string): { name?: string; config: Partial<CommandConfig> } | null {
  const trimmed = raw.trim()
  const match = trimmed.match(FRONTMATTER_RE)
  if (!match) {
    if (!trimmed) return null
    return { config: { template: trimmed } }
  }
  const frontmatter = match[1]
  const body = match[2].trim()
  const config: Partial<CommandConfig> = {}
  if (body) config.template = body
  let name: string | undefined

  for (const line of frontmatter.split("\n")) {
    const kv = line.match(/^(\w+)\s*:\s*(.*)$/)
    if (!kv) continue
    const key = kv[1].trim()
    const val = kv[2].trim().replace(/^["']|["']$/g, "")
    if (key === "description") config.description = val
    if (key === "model") config.model = val
    if (key === "agent") config.agent = val
    if (key === "subtask") config.subtask = val === "true"
    if (key === "name") name = val
  }

  return { name, config }
}

export function DialogEditCommand(props: Props) {
  const dialog = useDialog()
  const sdk = useGlobalSDK()
  const language = useLanguage()
  const editing = () => !!props.name

  const [store, setStore] = createStore({
    name: props.name ?? "",
    template: props.config?.template ?? "",
    description: props.config?.description ?? "",
    agent: props.config?.agent ?? "",
    model: props.config?.model ?? "",
    subtask: props.config?.subtask ?? false,
    saving: false,
    importOpen: false,
    importText: "",
    errors: {
      name: undefined as string | undefined,
      template: undefined as string | undefined,
    },
  })

  const applyImport = () => {
    const result = parseMarkdown(store.importText)
    if (!result || (!result.config.template && !result.name)) {
      showToast({
        variant: "error",
        title: language.t("settings.commands.import.error"),
      })
      return
    }
    if (result.name && !store.name) setStore("name", result.name)
    if (result.config.template) setStore("template", result.config.template)
    if (result.config.description) setStore("description", result.config.description)
    if (result.config.agent) setStore("agent", result.config.agent)
    if (result.config.model) setStore("model", result.config.model)
    if (result.config.subtask !== undefined) setStore("subtask", result.config.subtask)
    setStore("importOpen", false)
    setStore("importText", "")
  }

  const validate = () => {
    const name = store.name.trim()
    const template = store.template.trim()
    const nameError = !name ? language.t("settings.commands.validation.nameRequired") : undefined
    const templateError = !template ? language.t("settings.commands.validation.templateRequired") : undefined

    setStore("errors", { name: nameError, template: templateError })
    if (nameError || templateError) return

    const config: CommandConfig = { template }
    if (store.description.trim()) config.description = store.description.trim()
    if (store.agent.trim()) config.agent = store.agent.trim()
    if (store.model.trim()) config.model = store.model.trim()
    if (store.subtask) config.subtask = true
    return { name, config }
  }

  const save = async (event: SubmitEvent) => {
    event.preventDefault()
    if (store.saving) return
    const result = validate()
    if (!result) return
    setStore("saving", true)

    try {
      if (editing()) {
        await sdk.client.command.config.update({
          name: props.name!,
          config: result.config,
        })
      } else {
        await sdk.client.command.config.create({
          name: result.name,
          config: result.config,
        })
      }

      await props.onSaved?.()
      dialog.close()
      showToast({
        variant: "success",
        icon: "circle-check",
        title: language.t(editing() ? "settings.commands.toast.updated" : "settings.commands.toast.created"),
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
    <Dialog
      size="large"
      title={language.t(editing() ? "settings.commands.form.edit" : "settings.commands.form.create")}
    >
      <form onSubmit={save} class="flex flex-col gap-6 p-6 pt-0 overflow-y-auto">
        <div class="flex flex-col gap-4">
          {/* Import from Markdown - only in create mode */}
          <Show when={!editing()}>
            <div class="flex flex-col rounded-lg border border-border-weak-base overflow-hidden">
              <button
                type="button"
                class="flex items-center gap-2 px-4 py-3 text-left hover:bg-surface-raised-base transition-colors"
                onClick={() => setStore("importOpen", !store.importOpen)}
              >
                <Icon name={store.importOpen ? "chevron-down" : "chevron-right"} size="small" />
                <span class="text-13-medium text-text-weak">{language.t("settings.commands.import")}</span>
              </button>
              <Show when={store.importOpen}>
                <div class="flex flex-col gap-3 px-4 pb-4">
                  <span class="text-12-regular text-text-weaker">
                    {language.t("settings.commands.import.description")}
                  </span>
                  <TextField
                    multiline
                    placeholder={language.t("settings.commands.import.placeholder")}
                    value={store.importText}
                    onChange={(value) => setStore("importText", value)}
                  />
                  <div class="flex justify-end">
                    <Button
                      type="button"
                      size="large"
                      variant="secondary"
                      onClick={applyImport}
                      disabled={!store.importText.trim()}
                    >
                      {language.t("settings.commands.import.apply")}
                    </Button>
                  </div>
                </div>
              </Show>
            </div>
          </Show>

          <TextField
            autofocus={!editing()}
            readOnly={editing()}
            label={language.t("settings.commands.form.name")}
            placeholder={language.t("settings.commands.form.name.placeholder")}
            value={store.name}
            onChange={(value) => setStore("name", value)}
            validationState={store.errors.name ? "invalid" : undefined}
            error={store.errors.name}
          />
          <TextField
            multiline
            autofocus={editing()}
            label={language.t("settings.commands.form.template")}
            placeholder={language.t("settings.commands.form.template.placeholder")}
            value={store.template}
            onChange={(value) => setStore("template", value)}
            validationState={store.errors.template ? "invalid" : undefined}
            error={store.errors.template}
          />
          <TextField
            label={language.t("settings.commands.form.description")}
            placeholder={language.t("settings.commands.form.description.placeholder")}
            value={store.description}
            onChange={(value) => setStore("description", value)}
          />
          <TextField
            label={language.t("settings.commands.form.agent")}
            placeholder={language.t("settings.commands.form.agent.placeholder")}
            value={store.agent}
            onChange={(value) => setStore("agent", value)}
          />
          <TextField
            label={language.t("settings.commands.form.model")}
            placeholder={language.t("settings.commands.form.model.placeholder")}
            value={store.model}
            onChange={(value) => setStore("model", value)}
          />
          <div class="flex items-center justify-between gap-4 rounded-lg bg-surface-raised-base px-4 py-3">
            <div class="flex flex-col gap-1 min-w-0 shrink">
              <span class="text-14-medium text-text-strong">{language.t("settings.commands.form.subtask")}</span>
              <span class="text-12-regular text-text-weak whitespace-normal">
                {language.t("settings.commands.form.subtask.description")}
              </span>
            </div>
            <Switch checked={store.subtask} onChange={(value) => setStore("subtask", value)} hideLabel>
              {language.t("settings.commands.form.subtask")}
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
              : language.t(editing() ? "common.save" : "settings.commands.action.add")}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
