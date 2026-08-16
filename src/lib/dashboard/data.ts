import { createClient, getUser } from '@/lib/supabase/server'
import type { ArticleCuration } from '@/lib/articles/actions'

export interface ArticleItem {
  id: string
  title: string
  link: string | null
  summary: string | null
  published_at: string | null
  feed_title: string | null
  state: ArticleCuration | null
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

// All of a user's curation state fits comfortably in one query at personal
// scale — used both to exclude ignored items from the default views and to
// annotate the ones that are saved.
async function getArticleStatesMap(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<Map<string, ArticleCuration>> {
  const user = await getUser()
  if (!user) return new Map()

  const { data } = await supabase
    .from('article_states')
    .select('feed_item_id, state')
    .eq('user_id', user.id)

  return new Map((data ?? []).map((row) => [row.feed_item_id, row.state as ArticleCuration]))
}

const ARTICLE_SELECT =
  'id, feed_id, title, title_en, link, summary, summary_en, summary_ai, published_at'

function toArticleItem(
  item: {
    id: string
    feed_id: string
    title: string
    title_en: string | null
    link: string | null
    summary: string
    summary_en: string | null
    summary_ai: string | null
    published_at: string | null
  },
  feedTitles: Map<string, string | null>,
  states: Map<string, ArticleCuration>
): ArticleItem {
  return {
    id: item.id,
    title: bestTitle(item),
    link: item.link,
    summary: bestSummary(item),
    published_at: item.published_at,
    feed_title: feedTitles.get(item.feed_id) ?? null,
    state: states.get(item.id) ?? null,
  }
}

export async function getHeadlinesData(): Promise<ArticleItem[]> {
  const supabase = await createClient()
  const states = await getArticleStatesMap(supabase)
  const ignoredIds = [...states.entries()]
    .filter(([, state]) => state === 'ignored')
    .map(([id]) => id)

  let query = supabase
    .from('feed_items')
    .select(ARTICLE_SELECT)
    .order('published_at', { ascending: false })
    .limit(HEADLINES_LIMIT)
  if (ignoredIds.length > 0) {
    query = query.not('id', 'in', `(${ignoredIds.join(',')})`)
  }

  const { data: items } = await query
  if (!items) return []

  const feedTitles = await attachFeedTitles(supabase, items)
  return items.map((item) => toArticleItem(item, feedTitles, states))
}

export async function getFeedData(feedId: string): Promise<ArticleItem[]> {
  const supabase = await createClient()
  const states = await getArticleStatesMap(supabase)
  const ignoredIds = [...states.entries()]
    .filter(([, state]) => state === 'ignored')
    .map(([id]) => id)

  let query = supabase
    .from('feed_items')
    .select(ARTICLE_SELECT)
    .eq('feed_id', feedId)
    .order('published_at', { ascending: false })
    .limit(HEADLINES_LIMIT)
  if (ignoredIds.length > 0) {
    query = query.not('id', 'in', `(${ignoredIds.join(',')})`)
  }

  const { data: items } = await query
  if (!items) return []

  const feedTitles = await attachFeedTitles(supabase, items)
  return items.map((item) => toArticleItem(item, feedTitles, states))
}

export async function getFeedCategoryData(category: string): Promise<ArticleItem[]> {
  const supabase = await createClient()
  const states = await getArticleStatesMap(supabase)
  const ignoredIds = [...states.entries()]
    .filter(([, state]) => state === 'ignored')
    .map(([id]) => id)

  const { data: feedsInCategory } = await supabase
    .from('feeds')
    .select('id')
    .eq('category', category)
  const feedIds = (feedsInCategory ?? []).map((feed) => feed.id)
  if (feedIds.length === 0) return []

  let query = supabase
    .from('feed_items')
    .select(ARTICLE_SELECT)
    .in('feed_id', feedIds)
    .order('published_at', { ascending: false })
    .limit(HEADLINES_LIMIT)
  if (ignoredIds.length > 0) {
    query = query.not('id', 'in', `(${ignoredIds.join(',')})`)
  }

  const { data: items } = await query
  if (!items) return []

  const feedTitles = await attachFeedTitles(supabase, items)
  return items.map((item) => toArticleItem(item, feedTitles, states))
}

export async function getSavedArticlesData(): Promise<ArticleItem[]> {
  const supabase = await createClient()
  const states = await getArticleStatesMap(supabase)
  const savedIds = [...states.entries()]
    .filter(([, state]) => state === 'saved')
    .map(([id]) => id)

  if (savedIds.length === 0) return []

  const { data: items } = await supabase
    .from('feed_items')
    .select(ARTICLE_SELECT)
    .in('id', savedIds)
    .order('published_at', { ascending: false })

  if (!items) return []

  const feedTitles = await attachFeedTitles(supabase, items)
  return items.map((item) => toArticleItem(item, feedTitles, states))
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
