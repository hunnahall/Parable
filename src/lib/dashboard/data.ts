import { createClient, getUser } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'
import { isNotableMove, outlierFlags } from '@/lib/indicators/notable'
import type { ArticleCuration } from '@/lib/articles/actions'

export interface ArticleItem {
  id: string
  title: string
  link: string | null
  summary: string | null
  published_at: string | null
  feed_title: string | null
  category: string | null
  state: ArticleCuration | null
  note: string | null
  tags: string[]
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
  readings: { date: string; value: number; notable: boolean }[]
  notable: boolean
}

export interface WatchlistEntry {
  id: string
  display_name: string | null
  series_code: string
  latest_value: number | null
  previous_value: number | null
  notable: boolean
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

interface FeedMeta {
  title: string | null
  category: string | null
}

async function attachFeedMeta<T extends { feed_id: string }>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  items: T[]
): Promise<Map<string, FeedMeta>> {
  const feedIds = [...new Set(items.map((item) => item.feed_id))]
  if (feedIds.length === 0) return new Map()

  const { data: feeds, error } = await supabase
    .from('feeds')
    .select('id, title, category')
    .in('id', feedIds)
  logQueryError('dashboard/attachFeedMeta', error)

  return new Map(
    (feeds ?? []).map((feed) => [feed.id, { title: feed.title, category: feed.category }])
  )
}

interface ArticleStateInfo {
  state: ArticleCuration
  note: string | null
  tags: string[]
}

// All of a user's curation state fits comfortably in one query at personal
// scale — used both to exclude ignored items from the default views and to
// annotate the ones that are saved.
async function getArticleStatesMap(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<Map<string, ArticleStateInfo>> {
  const user = await getUser()
  if (!user) return new Map()

  const { data, error } = await supabase
    .from('article_states')
    .select('feed_item_id, state, note, tags')
    .eq('user_id', user.id)
  logQueryError('dashboard/getArticleStatesMap', error)

  return new Map(
    (data ?? []).map((row) => [
      row.feed_item_id,
      { state: row.state as ArticleCuration, note: row.note, tags: row.tags ?? [] },
    ])
  )
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
  feedMeta: Map<string, FeedMeta>,
  states: Map<string, ArticleStateInfo>
): ArticleItem {
  const info = states.get(item.id)
  const meta = feedMeta.get(item.feed_id)
  return {
    id: item.id,
    title: bestTitle(item),
    link: item.link,
    summary: bestSummary(item),
    published_at: item.published_at,
    feed_title: meta?.title ?? null,
    category: meta?.category ?? null,
    state: info?.state ?? null,
    note: info?.note ?? null,
    tags: info?.tags ?? [],
  }
}

export async function getHeadlinesData(): Promise<ArticleItem[]> {
  const supabase = await createClient()
  const states = await getArticleStatesMap(supabase)
  const ignoredIds = [...states.entries()]
    .filter(([, info]) => info.state === 'ignored')
    .map(([id]) => id)

  let query = supabase
    .from('feed_items')
    .select(ARTICLE_SELECT)
    .order('published_at', { ascending: false })
    .limit(HEADLINES_LIMIT)
  if (ignoredIds.length > 0) {
    query = query.not('id', 'in', `(${ignoredIds.join(',')})`)
  }

  const { data: items, error } = await query
  logQueryError('dashboard/getHeadlinesData', error)
  if (!items) return []

  const feedMeta = await attachFeedMeta(supabase, items)
  return items.map((item) => toArticleItem(item, feedMeta, states))
}

export async function getFeedData(feedId: string): Promise<ArticleItem[] | null> {
  const supabase = await createClient()

  // Distinguish "this feed was deleted" (null) from "this feed exists but
  // has no items right now" ([]) — a widget pointing at a deleted feed
  // would otherwise render the same generic empty state as a legitimately
  // empty feed, with no signal to the user that anything's wrong.
  const { data: feed, error: feedError } = await supabase
    .from('feeds')
    .select('id')
    .eq('id', feedId)
    .single()
  // .single() reports "no row" as an error too (PGRST116), which is the
  // expected/common case here (a deleted feed) — only log unexpected ones.
  if (feedError && feedError.code !== 'PGRST116') {
    logQueryError('dashboard/getFeedData (feed lookup)', feedError)
  }
  if (!feed) return null

  const states = await getArticleStatesMap(supabase)
  const ignoredIds = [...states.entries()]
    .filter(([, info]) => info.state === 'ignored')
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

  const { data: items, error } = await query
  logQueryError('dashboard/getFeedData', error)
  if (!items) return []

  const feedMeta = await attachFeedMeta(supabase, items)
  return items.map((item) => toArticleItem(item, feedMeta, states))
}

export async function getFeedCategoryData(category: string): Promise<ArticleItem[] | null> {
  const supabase = await createClient()

  // Same "deleted vs. genuinely empty" distinction as getFeedData — a
  // widget pointing at a deleted category shouldn't look identical to a
  // real category with no feeds in it yet.
  const { data: categoryRow, error: categoryError } = await supabase
    .from('categories')
    .select('name')
    .eq('name', category)
    .single()
  if (categoryError && categoryError.code !== 'PGRST116') {
    logQueryError('dashboard/getFeedCategoryData (category lookup)', categoryError)
  }
  if (!categoryRow) return null

  const states = await getArticleStatesMap(supabase)
  const ignoredIds = [...states.entries()]
    .filter(([, info]) => info.state === 'ignored')
    .map(([id]) => id)

  const { data: feedsInCategory, error: feedsInCategoryError } = await supabase
    .from('feeds')
    .select('id')
    .eq('category', category)
  logQueryError('dashboard/getFeedCategoryData (feeds lookup)', feedsInCategoryError)
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

  const { data: items, error } = await query
  logQueryError('dashboard/getFeedCategoryData', error)
  if (!items) return []

  const feedMeta = await attachFeedMeta(supabase, items)
  return items.map((item) => toArticleItem(item, feedMeta, states))
}

export async function getSavedArticlesData(): Promise<ArticleItem[]> {
  const supabase = await createClient()
  const states = await getArticleStatesMap(supabase)
  const savedIds = [...states.entries()]
    .filter(([, info]) => info.state === 'saved')
    .map(([id]) => id)

  if (savedIds.length === 0) return []

  const { data: items, error } = await supabase
    .from('feed_items')
    .select(ARTICLE_SELECT)
    .in('id', savedIds)
    .order('published_at', { ascending: false })
  logQueryError('dashboard/getSavedArticlesData', error)

  if (!items) return []

  const feedMeta = await attachFeedMeta(supabase, items)
  return items.map((item) => toArticleItem(item, feedMeta, states))
}

export interface ArticlesPageFilters {
  query?: string
  category?: string | null
  tag?: string | null
  savedOnly?: boolean
  cursor?: { publishedAt: string; id: string } | null
  limit?: number
}

export interface ArticlesPageResult {
  items: ArticleItem[]
  nextCursor: { publishedAt: string; id: string } | null
}

const ARTICLES_PAGE_LIMIT = 30
const UUID_RE = /^[0-9a-f-]{36}$/i

// Cursor-based (keyset) pagination, not offset/limit: feed_items is
// written to continuously by the ingest cron (every 30 min), so an offset
// page requested after new rows land would skip or duplicate items as the
// user pages — keyset pagination filters by value instead of position, so
// it's immune to that. (published_at, id) as the cursor tuple because
// published_at alone isn't unique; id is the tiebreaker for a total order.
export async function getArticlesPage(filters: ArticlesPageFilters): Promise<ArticlesPageResult> {
  const supabase = await createClient()
  const states = await getArticleStatesMap(supabase)
  const limit = filters.limit ?? ARTICLES_PAGE_LIMIT

  let query = supabase.from('feed_items').select(ARTICLE_SELECT)

  if (filters.query) {
    query = query.textSearch('search_vector', filters.query, {
      type: 'websearch',
      config: 'simple',
    })
  }

  if (filters.category) {
    const { data: feedsInCategory, error } = await supabase
      .from('feeds')
      .select('id')
      .eq('category', filters.category)
    logQueryError('dashboard/getArticlesPage (category lookup)', error)
    const feedIds = (feedsInCategory ?? []).map((feed) => feed.id)
    if (feedIds.length === 0) return { items: [], nextCursor: null }
    query = query.in('feed_id', feedIds)
  }

  // A tag filter implies saved (tags only exist on saved article_states
  // rows) — the two are mutually exclusive by the confirmed requirement,
  // not just coincidentally so.
  if (filters.tag) {
    const taggedIds = [...states.entries()]
      .filter(([, info]) => info.state === 'saved' && info.tags.includes(filters.tag!))
      .map(([id]) => id)
    if (taggedIds.length === 0) return { items: [], nextCursor: null }
    query = query.in('id', taggedIds)
  } else if (filters.savedOnly) {
    const savedIds = [...states.entries()]
      .filter(([, info]) => info.state === 'saved')
      .map(([id]) => id)
    if (savedIds.length === 0) return { items: [], nextCursor: null }
    query = query.in('id', savedIds)
  } else {
    const ignoredIds = [...states.entries()]
      .filter(([, info]) => info.state === 'ignored')
      .map(([id]) => id)
    if (ignoredIds.length > 0) {
      query = query.not('id', 'in', `(${ignoredIds.join(',')})`)
    }
  }

  query = query.order('published_at', { ascending: false }).order('id', { ascending: false })

  // Cursor values round-trip through the client (URL/form state) between
  // requests, so they're validated before being interpolated into a raw
  // PostgREST .or() filter string — an invalid cursor is treated as no
  // cursor (first page) rather than risking a malformed filter expression.
  const cursor = filters.cursor
  if (cursor && UUID_RE.test(cursor.id) && !Number.isNaN(Date.parse(cursor.publishedAt))) {
    query = query.or(
      `published_at.lt.${cursor.publishedAt},and(published_at.eq.${cursor.publishedAt},id.lt.${cursor.id})`
    )
  }

  query = query.limit(limit + 1)

  const { data: rows, error } = await query
  logQueryError('dashboard/getArticlesPage', error)
  if (!rows) return { items: [], nextCursor: null }

  const hasMore = rows.length > limit
  const pageRows = hasMore ? rows.slice(0, limit) : rows

  const feedMeta = await attachFeedMeta(supabase, pageRows)
  const items = pageRows.map((item) => toArticleItem(item, feedMeta, states))

  const last = pageRows.at(-1)
  const nextCursor = hasMore && last?.published_at ? { publishedAt: last.published_at, id: last.id } : null

  return { items, nextCursor }
}

// Distinct personal tags across saved articles, for the Articles page's
// tag filter — a small per-user set, same "fetch and dedupe in JS" scale
// reasoning as getArticleStatesMap.
export async function listSavedTags(): Promise<string[]> {
  const user = await getUser()
  if (!user) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('article_states')
    .select('tags')
    .eq('user_id', user.id)
    .eq('state', 'saved')
  logQueryError('dashboard/listSavedTags', error)

  const set = new Set<string>()
  for (const row of data ?? []) {
    for (const tag of row.tags ?? []) set.add(tag)
  }
  return [...set].sort()
}

export async function getIndicatorsData(
  indicatorId: string
): Promise<IndicatorData | null> {
  const supabase = await createClient()

  const { data: indicator, error: indicatorError } = await supabase
    .from('indicators')
    .select('id, display_name, series_code')
    .eq('id', indicatorId)
    .single()
  if (indicatorError && indicatorError.code !== 'PGRST116') {
    logQueryError('dashboard/getIndicatorsData (indicator lookup)', indicatorError)
  }

  if (!indicator) return null

  const { data: readings, error: readingsError } = await supabase
    .from('indicator_readings')
    .select('reading_date, value')
    .eq('indicator_id', indicatorId)
    .order('reading_date', { ascending: false })
    .limit(READINGS_LIMIT)
  logQueryError('dashboard/getIndicatorsData (readings)', readingsError)

  // Fetched newest-first (for a cheap "limit to most recent N" query) but
  // charted/reported oldest-first.
  const ordered = (readings ?? []).slice().reverse()
  const flags = outlierFlags(ordered.map((r) => r.value))

  return {
    id: indicator.id,
    display_name: indicator.display_name,
    series_code: indicator.series_code,
    latest_value: ordered.at(-1)?.value ?? null,
    previous_value: ordered.at(-2)?.value ?? null,
    readings: ordered.map((r, i) => ({ date: r.reading_date, value: r.value, notable: flags[i] })),
    notable: flags.at(-1) ?? false,
  }
}

// Not shown in the UI (the watchlist only renders latest/previous/notable)
// but isNotableMove wants a reasonable sample to compute a meaningful
// z-score from, so this matches READINGS_LIMIT rather than the bare
// minimum the flag needs.
const WATCHLIST_READINGS_LIMIT = READINGS_LIMIT

// One dense row per tracked indicator instead of one full widget each —
// a "vitals check" glance across everything at once, flagging any reading
// that's a real outlier via the same isNotableMove signal getIndicatorsData
// uses for the single-indicator widget.
export async function getWatchlistData(): Promise<WatchlistEntry[]> {
  const supabase = await createClient()

  const { data: indicators, error: indicatorsError } = await supabase
    .from('indicators')
    .select('id, display_name, series_code')
    .order('display_name')
  logQueryError('dashboard/getWatchlistData (indicators)', indicatorsError)
  if (!indicators || indicators.length === 0) return []

  // One bounded query per indicator (mirroring getIndicatorsData) rather
  // than one unbounded query across all indicators capped in JS afterward
  // — the latter pulled every reading for every indicator over the network
  // (tens of thousands of rows at this app's actual data volume) on every
  // single dashboard refresh, since this runs whenever *any* widget on the
  // page mutates, not just the watchlist itself.
  return Promise.all(
    indicators.map(async (indicator) => {
      const { data: readings, error: readingsError } = await supabase
        .from('indicator_readings')
        .select('value')
        .eq('indicator_id', indicator.id)
        .order('reading_date', { ascending: false })
        .limit(WATCHLIST_READINGS_LIMIT)
      logQueryError('dashboard/getWatchlistData (readings)', readingsError)

      const ordered = (readings ?? []).map((r) => r.value).reverse()
      return {
        id: indicator.id,
        display_name: indicator.display_name,
        series_code: indicator.series_code,
        latest_value: ordered.at(-1) ?? null,
        previous_value: ordered.at(-2) ?? null,
        notable: isNotableMove(ordered),
      }
    })
  )
}

export async function listFeeds(): Promise<FeedOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('feeds').select('id, title').order('title')
  logQueryError('dashboard/listFeeds', error)
  return data ?? []
}

export async function listIndicators(): Promise<IndicatorOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('indicators')
    .select('id, display_name')
    .order('display_name')
  logQueryError('dashboard/listIndicators', error)
  return data ?? []
}
