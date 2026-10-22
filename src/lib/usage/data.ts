import { createClient, getUser } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'
import {
  EMPTY_USAGE,
  estimateCostUsd,
  onDemandCostUsd,
  USAGE_WINDOW_DAYS,
  type IngestUsage,
  type SpendEntry,
  type UsageWindow,
} from '@/lib/usage/tokens'

// Server-only: this reaches next/headers through @/lib/supabase/server, so
// importing it from a Client Component is a build error rather than a
// runtime surprise. The presentational half of this module — UsageWindow,
// the formatters, USAGE_WINDOW_DAYS — deliberately lives in tokens.ts,
// which imports nothing, so a component can use them without dragging the
// database in.

// Rolling seven days of AI spend: ingest (ingest_runs) plus every
// on-demand summary and reader view (ai_usage).
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

  const { data: onDemandData, error: onDemandError } = await supabase
    .from('ai_usage')
    .select('input_tokens, output_tokens')
    .gte('created_at', since)
  logQueryError('usage/getRecentUsage (on demand)', onDemandError)
  const onDemand = (onDemandData ?? []) as { input_tokens: number; output_tokens: number }[]

  const rows = (data ?? []) as {
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
    // On-demand calls use the same model as summaries, so they're priced
    // in the same bucket.
    summarize: {
      calls: 0,
      inputTokens:
        sum(rows, (row) => row.summarize_input_tokens) + sum(onDemand, (row) => row.input_tokens),
      outputTokens:
        sum(rows, (row) => row.summarize_output_tokens) + sum(onDemand, (row) => row.output_tokens),
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

// Every priced ingest run and on-demand call from the last 32 days, enough
// for the 7-day chart and the month so far in any time zone.
export async function getSpendHistory(): Promise<SpendEntry[]> {
  const user = await getUser()
  if (!user) return []

  const supabase = await createClient()
  const since = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000).toISOString()
  const [{ data: runs, error: runsError }, { data: calls, error: callsError }] = await Promise.all([
    supabase
      .from('ingest_runs')
      .select('created_at, translate_input_tokens, translate_output_tokens, summarize_input_tokens, summarize_output_tokens, embed_input_tokens')
      .gte('created_at', since),
    supabase.from('ai_usage').select('created_at, input_tokens, output_tokens').gte('created_at', since),
  ])
  logQueryError('usage/getSpendHistory (runs)', runsError)
  logQueryError('usage/getSpendHistory (on demand)', callsError)

  const entries: SpendEntry[] = (runs ?? []).map((row) => ({
    at: row.created_at,
    usd: estimateCostUsd({
      translate: { ...EMPTY_USAGE, inputTokens: row.translate_input_tokens ?? 0, outputTokens: row.translate_output_tokens ?? 0 },
      summarize: { ...EMPTY_USAGE, inputTokens: row.summarize_input_tokens ?? 0, outputTokens: row.summarize_output_tokens ?? 0 },
      embed: { ...EMPTY_USAGE, inputTokens: row.embed_input_tokens ?? 0 },
    }),
  }))
  for (const row of calls ?? []) {
    entries.push({ at: row.created_at, usd: onDemandCostUsd(row.input_tokens, row.output_tokens) })
  }
  return entries
}

function sum<T>(rows: T[], pick: (row: T) => number | null): number {
  return rows.reduce((total, row) => total + (pick(row) ?? 0), 0)
}

