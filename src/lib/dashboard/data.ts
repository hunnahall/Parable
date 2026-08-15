import { createClient } from '@/lib/supabase/server'

export interface ArticleItem {
  id: string
  title: string
  link: string | null
  summary: string | null
  published_at: string | null
  feed_title: string | null
}

export interface FeedOption {
  id: string
  title: string | null
}

export interface IndicatorOption {
  id: string
  display_name: string | null
}

export interface IndicatorData {
  id: string
  display_name: string | null
  series_code: string
  latest_value: number | null
  previous_value: number | null
  readings: { date: string; value: number }[]
}

const HEADLINES_LIMIT = 20
const READINGS_LIMIT = 30

// title_en/summary_ai etc. are only populated once translation/summarization
// succeed for a given item (see src/lib/translate.ts, src/lib/summarize.ts) —
// callers should always fall back through the raw fields.
function bestTitle(item: { title: string; title_en: string | null }): string {
  return item.title_en ?? item.title
}

function bestSummary(item: {
  summary: string
  summary_en: string | null
  summary_ai: string | null
}): string | null {
  return item.summary_ai ?? item.summary_en ?? item.summary
}

async function attachFeedTitles<T extends { feed_id: string }>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  items: T[]
): Promise<Map<string, string | null>> {
  const feedIds = [...new Set(items.map((item) => item.feed_id))]
  if (feedIds.length === 0) return new Map()

  const { data: feeds } = await supabase
    .from('feeds')
    .select('id, title')
    .in('id', feedIds)

  return new Map((feeds ?? []).map((feed) => [feed.id, feed.title]))
}

export async function getHeadlinesData(): Promise<ArticleItem[]> {
  const supabase = await createClient()
  const { data: items } = await supabase
    .from('feed_items')
    .select(
      'id, feed_id, title, title_en, link, summary, summary_en, summary_ai, published_at'
    )
    .order('published_at', { ascending: false })
    .limit(HEADLINES_LIMIT)

  if (!items) return []

  const feedTitles = await attachFeedTitles(supabase, items)

  return items.map((item) => ({
    id: item.id,
    title: bestTitle(item),
    link: item.link,
    summary: bestSummary(item),
    published_at: item.published_at,
    feed_title: feedTitles.get(item.feed_id) ?? null,
  }))
}

export async function getFeedData(feedId: string): Promise<ArticleItem[]> {
  const supabase = await createClient()
  const { data: items } = await supabase
    .from('feed_items')
    .select(
      'id, feed_id, title, title_en, link, summary, summary_en, summary_ai, published_at'
    )
    .eq('feed_id', feedId)
    .order('published_at', { ascending: false })
    .limit(HEADLINES_LIMIT)

  if (!items) return []

  const feedTitles = await attachFeedTitles(supabase, items)

  return items.map((item) => ({
    id: item.id,
    title: bestTitle(item),
    link: item.link,
    summary: bestSummary(item),
    published_at: item.published_at,
    feed_title: feedTitles.get(item.feed_id) ?? null,
  }))
}

export async function getIndicatorsData(
  indicatorId: string
): Promise<IndicatorData | null> {
  const supabase = await createClient()

  const { data: indicator } = await supabase
    .from('indicators')
    .select('id, display_name, series_code')
    .eq('id', indicatorId)
    .single()

  if (!indicator) return null

  const { data: readings } = await supabase
    .from('indicator_readings')
    .select('reading_date, value')
    .eq('indicator_id', indicatorId)
    .order('reading_date', { ascending: false })
    .limit(READINGS_LIMIT)

  // Fetched newest-first (for a cheap "limit to most recent N" query) but
  // charted/reported oldest-first.
  const ordered = (readings ?? []).slice().reverse()

  return {
    id: indicator.id,
    display_name: indicator.display_name,
    series_code: indicator.series_code,
    latest_value: ordered.at(-1)?.value ?? null,
    previous_value: ordered.at(-2)?.value ?? null,
    readings: ordered.map((r) => ({ date: r.reading_date, value: r.value })),
  }
}

export async function listFeeds(): Promise<FeedOption[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('feeds').select('id, title').order('title')
  return data ?? []
}

export async function listIndicators(): Promise<IndicatorOption[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('indicators')
    .select('id, display_name')
    .order('display_name')
  return data ?? []
}
