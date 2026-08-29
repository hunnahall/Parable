import { createClient, getUser } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'
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
  archivedAt: string | null
  folderId: string | null
}

export interface FeedOption {
  id: string
  title: string | null
}

const HEADLINES_LIMIT = 20

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
  archivedAt: string | null
}

// All of a user's curation state fits comfortably in one query at personal
// scale — used both to exclude archived items from the default views and to
// annotate the ones that are saved/archived.
async function getArticleStatesMap(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<Map<string, ArticleStateInfo>> {
  const user = await getUser()
  if (!user) return new Map()

  const { data, error } = await supabase
    .from('article_states')
    .select('feed_item_id, state, note, tags, archived_at')
    .eq('user_id', user.id)
  logQueryError('dashboard/getArticleStatesMap', error)

  return new Map(
    (data ?? []).map((row) => [
      row.feed_item_id,
      {
        state: row.state as ArticleCuration,
        note: row.note,
        tags: row.tags ?? [],
        archivedAt: row.archived_at,
      },
    ])
  )
}

// A user's per-article folder filing (Saved-page organization) — separate
// from feed_folders (subscription organization), though both read from the
// same folders table. One row per (user, article) by article_folders' PK.
async function getArticleFoldersMap(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<Map<string, string>> {
  const user = await getUser()
  if (!user) return new Map()

  const { data, error } = await supabase
    .from('article_folders')
    .select('feed_item_id, folder_id')
    .eq('user_id', user.id)
  logQueryError('dashboard/getArticleFoldersMap', error)

  return new Map((data ?? []).map((row) => [row.feed_item_id, row.folder_id]))
}

const ARTICLE_SELECT =
  'id, feed_id, title, title_en, link, summary, summary_en, summary_ai, published_at'

// There's no generated Database type in this project (createClient() has
// no Schema generic), so postgrest-js can infer a `.from('feed_items')
// .select(ARTICLE_SELECT)` chain's row shape by parsing the select string
// against its generic fallback, but the same inference doesn't carry
// through an `.rpc(...)` chain (its generic Functions lookup has nothing
// to resolve without a real Schema) — argument count and the resulting
// row type both fall back to overloads that don't fit a SETOF-returning
// function. Runtime behavior is correct either way (validated directly
// against the REST API — see the migration that added these functions);
// this isolates the necessary `any` escape hatch to one place instead of
// casting at every call site.
export function feedItemsRpc(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fn: 'feed_items_excluding_states' | 'feed_items_with_state',
  args: Record<string, unknown>
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
  return (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => any)(fn, args)
}

// Row shape ARTICLE_SELECT resolves to.
type ArticleRow = {
  id: string
  feed_id: string
  title: string
  title_en: string | null
  link: string | null
  summary: string
  summary_en: string | null
  summary_ai: string | null
  published_at: string | null
}

function toArticleItem(
  item: ArticleRow,
  feedMeta: Map<string, FeedMeta>,
  states: Map<string, ArticleStateInfo>,
  folders: Map<string, string> = new Map()
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
    archivedAt: info?.archivedAt ?? null,
    folderId: folders.get(item.id) ?? null,
  }
}

// Single-article lookup for the reading view (src/app/articles/[id]/page.tsx)
// — same toArticleItem shape as the list views, plus original_language
// (needed there to decide whether translate-on-open should run).
export async function getArticleById(
  id: string
): Promise<(ArticleItem & { originalLanguage: string | null }) | null> {
  const supabase = await createClient()
  const { data: item, error } = await supabase
    .from('feed_items')
    .select(`${ARTICLE_SELECT}, original_language`)
    .eq('id', id)
    .maybeSingle()
  logQueryError('dashboard/getArticleById', error)
  if (!item) return null

  const states = await getArticleStatesMap(supabase)
  const folders = await getArticleFoldersMap(supabase)
  const feedMeta = await attachFeedMeta(supabase, [item])

  return { ...toArticleItem(item, feedMeta, states, folders), originalLanguage: item.original_language }
}

// Dashboard-widget reads (headlines/feed/category widgets on the home page)
// exclude archived articles but still show saved ones inline — the same
// "hide what the user dismissed" behavior the old ignored-exclusion gave,
// with archived as the new dismissal signal.
export async function getHeadlinesData(): Promise<ArticleItem[]> {
  const supabase = await createClient()
  const user = await getUser()
  if (!user) return []
  const states = await getArticleStatesMap(supabase)

  // feed_items_excluding_states does the "not archived" membership test as
  // a real SQL join instead of a `.not('id', 'in', archivedIds)` filter —
  // that pattern interpolates every excluded id into the request URL,
  // which breaks once article_states grows past a few hundred rows. See
  // the migration that added this function for the full story.
  const { data: items, error } = await feedItemsRpc(supabase, 'feed_items_excluding_states', {
    p_user_id: user.id,
    p_exclude_states: ['archived'],
  })
    .select(ARTICLE_SELECT)
    .order('published_at', { ascending: false })
    .limit(HEADLINES_LIMIT)
  logQueryError('dashboard/getHeadlinesData', error)
  if (!items) return []

  const feedMeta = await attachFeedMeta(supabase, items)
  return items.map((item: ArticleRow) => toArticleItem(item, feedMeta, states))
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

  const user = await getUser()
  if (!user) return []
  const states = await getArticleStatesMap(supabase)

  const { data: items, error } = await feedItemsRpc(supabase, 'feed_items_excluding_states', {
    p_user_id: user.id,
    p_exclude_states: ['archived'],
  })
    .select(ARTICLE_SELECT)
    .eq('feed_id', feedId)
    .order('published_at', { ascending: false })
    .limit(HEADLINES_LIMIT)
  logQueryError('dashboard/getFeedData', error)
  if (!items) return []

  const feedMeta = await attachFeedMeta(supabase, items)
  return items.map((item: ArticleRow) => toArticleItem(item, feedMeta, states))
}

export async function getFeedCategoryData(category: string): Promise<ArticleItem[] | null> {
  const supabase = await createClient()

  // Same "deleted vs. genuinely empty" distinction as getFeedData — a
  // widget pointing at a deleted category shouldn't look identical to a
  // real category with no feeds in it yet. (This widget still reads the
  // legacy categories/feeds.category columns, kept read-only alongside
  // folders until the home dashboard's category widget is migrated too —
  // out of scope for the folders/tags rework.)
  const { data: categoryRow, error: categoryError } = await supabase
    .from('categories')
    .select('name')
    .eq('name', category)
    .single()
  if (categoryError && categoryError.code !== 'PGRST116') {
    logQueryError('dashboard/getFeedCategoryData (category lookup)', categoryError)
  }
  if (!categoryRow) return null

  const user = await getUser()
  if (!user) return []
  const states = await getArticleStatesMap(supabase)

  const { data: feedsInCategory, error: feedsInCategoryError } = await supabase
    .from('feeds')
    .select('id')
    .eq('category', category)
  logQueryError('dashboard/getFeedCategoryData (feeds lookup)', feedsInCategoryError)
  const feedIds = (feedsInCategory ?? []).map((feed) => feed.id)
  if (feedIds.length === 0) return []

  const { data: items, error } = await feedItemsRpc(supabase, 'feed_items_excluding_states', {
    p_user_id: user.id,
    p_exclude_states: ['archived'],
  })
    .select(ARTICLE_SELECT)
    .in('feed_id', feedIds)
    .order('published_at', { ascending: false })
    .limit(HEADLINES_LIMIT)
  logQueryError('dashboard/getFeedCategoryData', error)
  if (!items) return []

  const feedMeta = await attachFeedMeta(supabase, items)
  return items.map((item: ArticleRow) => toArticleItem(item, feedMeta, states))
}

// Home dashboard's "Saved articles" widget — unbounded (no pagination),
// unlike the Saved page's getArticlesPage({view:'saved'}), which supports
// filters/cursor pagination.
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

// Sidebar badge count: articles with no curation row at all (not saved,
// not archived) — same "unfiled" predicate the Articles page uses as its
// default view. feed_items_excluding_states does the anti-join in SQL
// (see the migration that added it) rather than fetching every filed id
// and building a `.not('id', 'in', ...)` filter, which broke once
// article_states grew past a few hundred rows.
export async function getArticlesUnfiledCount(): Promise<number> {
  const user = await getUser()
  if (!user) return 0

  const supabase = await createClient()
  // Not `.select('id', { count: 'exact', head: true })`: PostgREST doesn't
  // return a Content-Range count header for a HEAD request against an RPC
  // endpoint (only plain table queries), so that combination silently came
  // back with count === null here — the badge was always rendering as 0.
  // The inbox is bounded (excludes saved/archived), so fetching ids and
  // counting them client-side is cheap and actually works.
  const { data, error } = await feedItemsRpc(supabase, 'feed_items_excluding_states', {
    p_user_id: user.id,
    p_exclude_states: ['saved', 'archived'],
  }).select('id')
  logQueryError('dashboard/getArticlesUnfiledCount', error)
  return data?.length ?? 0
}

export interface ArticlesPageFilters {
  query?: string
  view?: 'unfiled' | 'saved' | 'archived'
  folderId?: string | null
  sourceFeedId?: string | null
  tag?: string | null
  dateFrom?: string | null
  dateTo?: string | null
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
//
// Powers all three lifecycle pages (Articles/Saved/Archive) via `view`:
// 'unfiled' = no article_states row yet (default, the Articles page),
// 'saved'/'archived' = state matches exactly (the Saved/Archive pages).
export async function getArticlesPage(filters: ArticlesPageFilters): Promise<ArticlesPageResult> {
  const user = await getUser()
  if (!user) return { items: [], nextCursor: null }

  const supabase = await createClient()
  const states = await getArticleStatesMap(supabase)
  const folders = await getArticleFoldersMap(supabase)
  const limit = filters.limit ?? ARTICLES_PAGE_LIMIT
  const view = filters.view ?? 'unfiled'

  // Unfiled articles never have a curation row, so they can never carry
  // tags — a tag filter combined with the unfiled view is definitionally
  // empty rather than a query worth running.
  if (filters.tag && view === 'unfiled') {
    return { items: [], nextCursor: null }
  }

  // A tag filter needs the specific (state, tag) intersection, which stays
  // small in practice (a tag narrows things down) — kept as an id list.
  // Everything else routes through feed_items_excluding_states/with_state,
  // which do the state membership test as a real SQL join instead of
  // interpolating every matching id into the request URL — that's what
  // broke once article_states grew past a few hundred rows (see the
  // migration that added those functions).
  let includeIds: string[] | null = null
  if (filters.tag) {
    includeIds = [...states.entries()]
      .filter(([, info]) => info.state === view && info.tags.includes(filters.tag!))
      .map(([id]) => id)
  }

  let query
  if (includeIds !== null) {
    if (includeIds.length === 0) return { items: [], nextCursor: null }
    query = supabase.from('feed_items').select(ARTICLE_SELECT).in('id', includeIds)
  } else if (view === 'unfiled') {
    query = feedItemsRpc(supabase, 'feed_items_excluding_states', {
      p_user_id: user.id,
      p_exclude_states: ['saved', 'archived'],
    }).select(ARTICLE_SELECT)
  } else {
    query = feedItemsRpc(supabase, 'feed_items_with_state', {
      p_user_id: user.id,
      p_state: view,
    }).select(ARTICLE_SELECT)
  }

  if (filters.query) {
    query = query.textSearch('search_vector', filters.query, {
      type: 'websearch',
      config: 'simple',
    })
  }

  if (filters.sourceFeedId) {
    query = query.eq('feed_id', filters.sourceFeedId)
  }

  if (filters.dateFrom) {
    query = query.gte('published_at', filters.dateFrom)
  }
  if (filters.dateTo) {
    query = query.lte('published_at', filters.dateTo)
  }

  // A folder can hold feeds (subscription organization) and/or saved
  // articles filed directly into it — matching either satisfies the
  // filter, since both mean "this article belongs to that folder" from
  // the user's point of view.
  if (filters.folderId) {
    const [{ data: feedFolderRows, error: feedFolderError }, { data: articleFolderRows, error: articleFolderError }] =
      await Promise.all([
        supabase.from('feed_folders').select('feed_id').eq('folder_id', filters.folderId),
        supabase.from('article_folders').select('feed_item_id').eq('folder_id', filters.folderId),
      ])
    logQueryError('dashboard/getArticlesPage (folder feed lookup)', feedFolderError)
    logQueryError('dashboard/getArticlesPage (folder article lookup)', articleFolderError)

    const folderFeedIds = (feedFolderRows ?? []).map((row) => row.feed_id)
    const folderArticleIds = (articleFolderRows ?? []).map((row) => row.feed_item_id)
    if (folderFeedIds.length === 0 && folderArticleIds.length === 0) {
      return { items: [], nextCursor: null }
    }

    const orParts: string[] = []
    if (folderFeedIds.length > 0) orParts.push(`feed_id.in.(${folderFeedIds.join(',')})`)
    if (folderArticleIds.length > 0) orParts.push(`id.in.(${folderArticleIds.join(',')})`)
    query = query.or(orParts.join(','))
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
  const items = pageRows.map((item: ArticleRow) => toArticleItem(item, feedMeta, states, folders))

  const last = pageRows.at(-1)
  const nextCursor = hasMore && last?.published_at ? { publishedAt: last.published_at, id: last.id } : null

  return { items, nextCursor }
}

export async function listFeeds(): Promise<FeedOption[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('feeds').select('id, title').order('title')
  logQueryError('dashboard/listFeeds', error)
  return data ?? []
}
