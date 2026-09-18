import { createClient, getUser } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'
import { estimateCostUsd, type IngestUsage } from '@/lib/usage/tokens'

export interface UsageWindow {
  // Input + output across every path. Embedding tokens are included —
  // they are real spend, even though they are a rounding error next to
  // summarization.
  totalTokens: number
  estimatedUsd: number
}

export const USAGE_WINDOW_DAYS = 7

// Rolling seven days of ingest spend, summed from ingest_runs.
//
// Read with the caller's own RLS-scoped client: the table is readable by
// any signed-in account and writable by none (ingest writes it as the
// service role). Nothing here is per-user — ingest is one shared job, so
// its spend is a property of the project, not of an account.
export async function getRecentUsage(): Promise<UsageWindow | null> {
  const user = await getUser()
  if (!user) return null

  const supabase = await createClient()
  const since = new Date(Date.now() - USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Summed in JS rather than SQL: at six runs a day this window is ~42
  // rows, and keeping the arithmetic next to estimateCostUsd means the
  // per-1M prices live in exactly one place instead of being duplicated
  // into a view that would drift.
  // One literal rather than a concatenation: postgrest-js infers the row
  // shape by parsing the select string at the type level, and a built-up
  // string degrades it to GenericStringError.
  const { data, error } = await supabase
    .from('ingest_runs')
    .select('translate_input_tokens, translate_output_tokens, summarize_input_tokens, summarize_output_tokens, embed_input_tokens')
    .gte('created_at', since)
  logQueryError('usage/getRecentUsage', error)
  if (!data || data.length === 0) return { totalTokens: 0, estimatedUsd: 0 }

  const rows = data as {
    translate_input_tokens: number
    translate_output_tokens: number
    summarize_input_tokens: number
    summarize_output_tokens: number
    embed_input_tokens: number
  }[]

  // Rebuilt into the same shape estimateCostUsd takes so pricing stays in
  // src/lib/usage.ts. Call counts and reasoning tokens don't affect the
  // total or the cost, so they are left at zero here.
  const usage: IngestUsage = {
    translate: {
      calls: 0,
      inputTokens: sum(rows, (row) => row.translate_input_tokens),
      outputTokens: sum(rows, (row) => row.translate_output_tokens),
      reasoningTokens: 0,
    },
    summarize: {
      calls: 0,
      inputTokens: sum(rows, (row) => row.summarize_input_tokens),
      outputTokens: sum(rows, (row) => row.summarize_output_tokens),
      reasoningTokens: 0,
    },
    embed: {
      calls: 0,
      inputTokens: sum(rows, (row) => row.embed_input_tokens),
      outputTokens: 0,
      reasoningTokens: 0,
    },
  }

  const totalTokens =
    usage.translate.inputTokens +
    usage.translate.outputTokens +
    usage.summarize.inputTokens +
    usage.summarize.outputTokens +
    usage.embed.inputTokens

  return { totalTokens, estimatedUsd: estimateCostUsd(usage) }
}

function sum<T>(rows: T[], pick: (row: T) => number | null): number {
  return rows.reduce((total, row) => total + (pick(row) ?? 0), 0)
}

// 1_240_000 -> "1.24M". Kept compact because the Usage box is a third of a
// column wide.
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return String(tokens)
}

// Sub-cent spend reads as "$0.00", which looks like a bug rather than a
// small number — show it as "<$0.01" instead.
export function formatUsd(usd: number): string {
  if (usd > 0 && usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}
