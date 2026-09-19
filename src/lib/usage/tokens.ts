// Token accounting for the ingest pipeline's OpenAI calls.
//
// Every cost decision made so far — batching title translation, dropping
// summary_en, the 6000 -> 2500 body cap — was argued from estimates,
// because nothing in the pipeline ever recorded what a run actually spent.
// That was fine while the wins were obvious. It stops being fine for the
// next round, where the question is whether batching summarization pays
// for its complexity, and the honest answer is "measure it".
//
// Reasoning tokens are tracked separately from visible output because they
// are the thing per-call batching actually removes: gpt-5-nano bills them
// even at effort 'minimal', they count against max_output_tokens, and
// output is 8x the price of input on this model. If reasoningTokens is a
// large share of outputTokens, batching summarization is worth it; if it
// isn't, it isn't.
export interface TokenUsage {
  calls: number
  inputTokens: number
  outputTokens: number
  // Subset of outputTokens, not an addition to it.
  reasoningTokens: number
}

export const EMPTY_USAGE: TokenUsage = {
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    calls: a.calls + b.calls,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
  }
}

export function sumUsage(items: TokenUsage[]): TokenUsage {
  return items.reduce(addUsage, EMPTY_USAGE)
}

// Structural rather than importing OpenAI's response type: the Responses
// and Embeddings endpoints report usage under different field names, and
// a failed call has none at all. Every field is optional so a shape change
// degrades to zero rather than throwing inside the ingest loop.
interface RawUsage {
  input_tokens?: number
  output_tokens?: number
  prompt_tokens?: number
  total_tokens?: number
  output_tokens_details?: { reasoning_tokens?: number } | null
}

// One API call's usage. Pass the `usage` off any OpenAI response; `calls`
// counts 1 either way, since a call that came back without usage still
// happened and still cost something.
export function usageOf(raw: RawUsage | null | undefined): TokenUsage {
  return {
    calls: 1,
    // Embeddings report prompt_tokens where Responses reports input_tokens.
    inputTokens: raw?.input_tokens ?? raw?.prompt_tokens ?? 0,
    outputTokens: raw?.output_tokens ?? 0,
    reasoningTokens: raw?.output_tokens_details?.reasoning_tokens ?? 0,
  }
}

// Every OpenAI call a single ingest run made, split by the three paths so
// a change to one is visible without disentangling it from the others.
export interface IngestUsage {
  translate: TokenUsage
  summarize: TokenUsage
  embed: TokenUsage
}

export const EMPTY_INGEST_USAGE: IngestUsage = {
  translate: EMPTY_USAGE,
  summarize: EMPTY_USAGE,
  embed: EMPTY_USAGE,
}

export function addIngestUsage(a: IngestUsage, b: IngestUsage): IngestUsage {
  return {
    translate: addUsage(a.translate, b.translate),
    summarize: addUsage(a.summarize, b.summarize),
    embed: addUsage(a.embed, b.embed),
  }
}

// Per 1M tokens, gpt-5-nano and text-embedding-3-small. Hard-coded rather
// than fetched: this is a log line for orders of magnitude, not an invoice,
// and a stale constant here is less misleading than no number at all.
const NANO_INPUT_PER_1M = 0.05
const NANO_OUTPUT_PER_1M = 0.4
const EMBED_INPUT_PER_1M = 0.02

export function estimateCostUsd(usage: IngestUsage): number {
  const llmInput = usage.translate.inputTokens + usage.summarize.inputTokens
  const llmOutput = usage.translate.outputTokens + usage.summarize.outputTokens
  return (
    (llmInput * NANO_INPUT_PER_1M) / 1_000_000 +
    (llmOutput * NANO_OUTPUT_PER_1M) / 1_000_000 +
    (usage.embed.inputTokens * EMBED_INPUT_PER_1M) / 1_000_000
  )
}

// One line, stable shape, greppable in platform logs — the point is to be
// able to compare two runs, so the field order and units never change.
export function formatUsage(usage: IngestUsage): string {
  const part = (name: string, u: TokenUsage) =>
    `${name}[calls=${u.calls} in=${u.inputTokens} out=${u.outputTokens} reasoning=${u.reasoningTokens}]`
  return (
    `${part('translate', usage.translate)} ${part('summarize', usage.summarize)} ` +
    `${part('embed', usage.embed)} est=$${estimateCostUsd(usage).toFixed(4)}`
  )
}

// Rolling-window spend, as the Usage box on /settings renders it. Lives
// here rather than beside the query that produces it (usage/data.ts)
// because that module reaches next/headers and cannot be imported from a
// Client Component; this file imports nothing at all.
export interface UsageWindow {
  // Input + output across every path. Embedding tokens are included —
  // they are real spend, even though they are a rounding error next to
  // summarization.
  totalTokens: number
  estimatedUsd: number
}

export const USAGE_WINDOW_DAYS = 7

// Sub-cent spend reads as "$0.00", which looks like a bug rather than a
// small number — show it as "<$0.01" instead. A true zero still renders as
// "$0.00", which is the intended reading of an empty window.
export function formatUsd(usd: number): string {
  if (usd > 0 && usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}
