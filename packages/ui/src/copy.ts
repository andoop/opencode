export async function copyText(value: string) {
  if (!value) return false

  const body = document.body
  if (body) {
    const textarea = document.createElement("textarea")
    textarea.value = value
    textarea.setAttribute("readonly", "")
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    body.appendChild(textarea)
    textarea.select()
    textarea.setSelectionRange(0, value.length)
    const ok = document.execCommand("copy")
    body.removeChild(textarea)
    if (ok) return true
  }

  const clipboard = navigator.clipboard
  if (!clipboard?.writeText) return false

  try {
    await clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}
