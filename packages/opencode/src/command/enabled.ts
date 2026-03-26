export function commandEnabled(commands: Record<string, boolean> | undefined, name: string) {
  return commands?.[name] !== false
}
