function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function toFinite(value: unknown) {
  if (typeof value !== "number") return
  if (!Number.isFinite(value)) return
  return value
}

export type PromptUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  reasoningTokens: number
  cachedInputTokens?: number
}

export type PromptUsageInfo = {
  usage: PromptUsage
  providerMetadata?: Record<string, unknown>
}

function parseUsage(value: Record<string, unknown>) {
  const promptTokensDetails = isRecord(value.promptTokensDetails)
    ? value.promptTokensDetails
    : isRecord(value.prompt_tokens_details)
      ? value.prompt_tokens_details
      : isRecord(value.inputTokensDetails)
        ? value.inputTokensDetails
        : isRecord(value.input_tokens_details)
          ? value.input_tokens_details
          : undefined
  const completionTokensDetails = isRecord(value.completionTokensDetails)
    ? value.completionTokensDetails
    : isRecord(value.completion_tokens_details)
      ? value.completion_tokens_details
      : undefined

  const inputTokens =
    toFinite(value.inputTokens) ??
    toFinite(value.input_tokens) ??
    toFinite(value.promptTokens) ??
    toFinite(value.prompt_tokens)
  const outputTokens =
    toFinite(value.outputTokens) ??
    toFinite(value.output_tokens) ??
    toFinite(value.completionTokens) ??
    toFinite(value.completion_tokens)
  const reasoningTokens =
    toFinite(value.reasoningTokens) ??
    toFinite(value.reasoning_tokens) ??
    toFinite(completionTokensDetails?.reasoningTokens) ??
    toFinite(completionTokensDetails?.reasoning_tokens)
  const cachedInputTokens =
    toFinite(value.cachedInputTokens) ??
    toFinite(value.cached_input_tokens) ??
    toFinite(promptTokensDetails?.cachedTokens) ??
    toFinite(promptTokensDetails?.cached_tokens)
  const totalTokens = toFinite(value.totalTokens) ?? toFinite(value.total_tokens)

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    reasoningTokens === undefined &&
    cachedInputTokens === undefined &&
    totalTokens === undefined
  )
    return

  const usage = {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    totalTokens: totalTokens ?? (inputTokens ?? 0) + (outputTokens ?? 0),
    reasoningTokens: reasoningTokens ?? 0,
  } satisfies PromptUsage

  if (cachedInputTokens === undefined) return usage
  return {
    ...usage,
    cachedInputTokens,
  } satisfies PromptUsage
}

function parseProviderMetadata(value: Record<string, unknown>) {
  if (isRecord(value.providerMetadata)) return value.providerMetadata
  if (isRecord(value.provider_metadata)) return value.provider_metadata
  if (isRecord(value.metadata)) return value.metadata

  const next = {
    ...(isRecord(value.anthropic) ? { anthropic: value.anthropic } : {}),
    ...(isRecord(value.bedrock) ? { bedrock: value.bedrock } : {}),
    ...(isRecord(value.venice) ? { venice: value.venice } : {}),
  }
  if (Object.keys(next).length === 0) return
  return next
}

function betterUsage(current: PromptUsage | undefined, next: PromptUsage) {
  if (!current) return true
  if (next.totalTokens !== current.totalTokens) return next.totalTokens > current.totalTokens
  const currentMeasured =
    current.inputTokens + current.outputTokens + current.reasoningTokens + (current.cachedInputTokens ?? 0)
  const nextMeasured = next.inputTokens + next.outputTokens + next.reasoningTokens + (next.cachedInputTokens ?? 0)
  return nextMeasured > currentMeasured
}

export function extractPromptUsageInfo(input: unknown): PromptUsageInfo | undefined {
  const queue = [input]
  const seen = new Set<object>()
  let usage: PromptUsage | undefined
  let providerMetadata: Record<string, unknown> | undefined

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue

    if (Array.isArray(current)) {
      for (const item of current) queue.push(item)
      continue
    }

    if (!isRecord(current)) continue
    if (seen.has(current)) continue
    seen.add(current)

    const direct = parseUsage(current)
    if (direct && betterUsage(usage, direct)) usage = direct

    const nested = isRecord(current.usage) ? parseUsage(current.usage) : undefined
    if (nested && betterUsage(usage, nested)) usage = nested

    if (!providerMetadata) {
      providerMetadata = parseProviderMetadata(current)
    }

    for (const value of Object.values(current)) {
      queue.push(value)
    }
  }

  if (!usage) return
  return { usage, providerMetadata }
}

export function addPromptUsage(total: PromptUsage | undefined, next: PromptUsage | undefined) {
  if (!next) return total
  if (!total) return { ...next }
  return {
    inputTokens: total.inputTokens + next.inputTokens,
    outputTokens: total.outputTokens + next.outputTokens,
    totalTokens: total.totalTokens + next.totalTokens,
    reasoningTokens: total.reasoningTokens + next.reasoningTokens,
    cachedInputTokens: (total.cachedInputTokens ?? 0) + (next.cachedInputTokens ?? 0),
  } satisfies PromptUsage
}
