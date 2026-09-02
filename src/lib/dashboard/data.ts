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
  // Article-level image (enclosure/media:content/media:thumbnail captured
  // at ingest, or a scraped feed's detected image) — null for most feeds.
  // Card view (ArticleCardGrid) falls back to a favicon derived from
  // `link`'s origin when this is null.
  imageUrl: string | null
  // True only when `summary` above is the AI-generated summary (not the
  // feed's raw or translated text) — drives the "AI Summary" badge, so
  // users can tell the three summary sources apart at a glance.
  isAiSummary: boolean
}

export interface FeedOption {
  id: string
  title: string | null
}

// title_en/summary_ai etc. are only populated once translation/summarization
// succeed for a given item (see src/lib/translate.ts, src/lib/summarize.ts) —
// callers should always fall back through the raw fields.
function bestTitle(item: { title: string; title_en: string | null }): string {
  return item.title_en ?? item.title
}

// `summarizeArticles` is the feed's CURRENT toggle state, not just
// whatever happens to be stored in summary_ai — a feed can have its
// toggle off today but still carry summary_ai values written while it
// was on (see retention.ts: summary_ai is deliberately never cleared by
// background jobs). Gating here means the toggle takes effect
// immediately for every already-ingested article, not just future ones.
//
// No raw/translated fallback when the toggle is off: list views render
// every unfiled article, so a teaser shown by default there scales with
// total article volume rather than actual reading — cut entirely to keep
// that cost down. A summary is still one click away via "Summarize this"
// in the reading view (see ArticleReadingView + /api/articles/[id]/summarize).
function bestSummary(
  item: { summary: string; summary_en: string | null; summary_ai: string | null },
  summarizeArticles: boolean
): string | null {
  if (!summarizeArticles) return null
  return item.summary_ai ?? item.summary_en ?? item.summary
}

interface FeedMeta {
  title: string | null
  category: string | null
  summarizeArticles: boolean
}

async function attachFeedMeta<T extends { feed_id: string }>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  items: T[]
): Promise<Map<string, FeedMeta>> {
  const feedIds = [...new Set(items.map((item) => item.feed_id))]
  if (feedIds.length === 0) return new Map()

  const { data: feeds, error } = await supabase
    .from('feeds')
    .select('id, title, category, summarize_articles')
    .in('id', feedIds)
  logQueryError('dashboard/attachFeedMeta', error)

  return new Map(
    (feeds ?? []).map((feed) => [
      feed.id,
      { title: feed.title, category: feed.category, summarizeArticles: feed.summarize_articles },
    ])
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
//
// `user` is optional: pass an already-resolved user (or null) when the
// caller has one in hand so this doesn't pay for its own getUser() call —
// see getArticleById, which resolves it once and fans it out to this and
// getArticleFoldersMap in parallel instead of each calling getUser()
// separately. Omit it (or pass undefined) to resolve it here as before.
async function getArticleStatesMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user?: Awaited<ReturnType<typeof getUser>>
): Promise<Map<string, ArticleStateInfo>> {
  const resolvedUser = user !== undefined ? user : await getUser()
  if (!resolvedUser) return new Map()

  const { data, error } = await supabase
    .from('article_states')
    .select('feed_item_id, state, note, tags, archived_at')
    .eq('user_id', resolvedUser.id)
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
// See getArticleStatesMap above for why `user` is optional.
async function getArticleFoldersMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user?: Awaited<ReturnType<typeof getUser>>
): Promise<Map<string, string>> {
  const resolvedUser = user !== undefined ? user : await getUser()
  if (!resolvedUser) return new Map()

  const { data, error } = await supabase
    .from('article_folders')
    .select('feed_item_id, folder_id')
    .eq('user_id', resolvedUser.id)
  logQueryError('dashboard/getArticleFoldersMap', error)

  return new Map((data ?? []).map((row) => [row.feed_item_id, row.folder_id]))
}

const ARTICLE_SELECT =
  'id, feed_id, title, title_en, link, summary, summary_en, summary_ai, published_at, image_url'

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
  image_url: string | null
}

function toArticleItem(
  item: ArticleRow,
  feedMeta: Map<string, FeedMeta>,
  states: Map<string, ArticleStateInfo>,
  folders: Map<string, string> = new Map()
): ArticleItem {
  const info = states.get(item.id)
  const meta = feedMeta.get(item.feed_id)
  const summarizeArticles = meta?.summarizeArticles ?? false
  return {
    id: item.id,
    title: bestTitle(item),
    link: item.link,
    summary: bestSummary(item, summarizeArticles),
    // True only when the summary actually shown is the AI-generated one
    // (not the raw/translated feed text) — drives the "AI Summary" badge.
    isAiSummary: summarizeArticles && item.summary_ai !== null,
    published_at: item.published_at,
    feed_title: meta?.title ?? null,
    category: meta?.category ?? null,
    state: info?.state ?? null,
    note: info?.note ?? null,
    tags: info?.tags ?? [],
    archivedAt: info?.archivedAt ?? null,
    folderId: folders.get(item.id) ?? null,
    imageUrl: item.image_url,
  }
}

// Single-article lookup for the reading view (src/app/read/[id]/page.tsx)
// — same toArticleItem shape as the list views, plus original_language
// (needed there to decide whether translate-on-open should run).
export async function getArticleById(
  id: string
): Promise<(ArticleItem & { originalLanguage: string | null }) | null> {
  const supabase = await createClient()
  // The item select and the user lookup are independent of each other —
  // resolving user here once (instead of the two separate internal
  // getUser() calls getArticleStatesMap/getArticleFoldersMap used to each
  // make) removes the artificial sequential ordering between them below.
  const [{ data: item, error }, user] = await Promise.all([
    supabase.from('feed_items').select(`${ARTICLE_SELECT}, original_language`).eq('id', id).maybeSingle(),
    getUser(),
  ])
  logQueryError('dashboard/getArticleById', error)
  if (!item) return null

  // states/folders/feedMeta only depend on `item`/`user` above, not on
  // each other — previously awaited one at a time, paying for each
  // other's latency serially for no reason.
  const [states, folders, feedMeta] = await Promise.all([
    getArticleStatesMap(supabase, user),
    getArticleFoldersMap(supabase, user),
    attachFeedMeta(supabase, [item]),
  ])

  return { ...toArticleItem(item, feedMeta, states, folders), originalLanguage: item.original_language }
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
  // The inbox is bounded (excludes saved/archived/reading), so fetching ids
  // and counting them client-side is cheap and actually works.
  const { data, error } = await feedItemsRpc(supabase, 'feed_items_excluding_states', {
    p_user_id: user.id,
    p_exclude_states: ['saved', 'archived', 'reading'],
  }).select('id')
  logQueryError('dashboard/getArticlesUnfiledCount', error)
  return data?.length ?? 0
}

// Sidebar badge for the Reader nav entry — same pattern as
// getArticlesUnfiledCount above, just against the 'reading' state directly
// instead of an exclusion set.
export async function getReaderCount(): Promise<number> {
  const user = await getUser()
  if (!user) return 0

  const supabase = await createClient()
  const { data, error } = await feedItemsRpc(supabase, 'feed_items_with_state', {
    p_user_id: user.id,
    p_state: 'reading',
  }).select('id')
  logQueryError('dashboard/getReaderCount', error)
  return data?.length ?? 0
}

export interface ArticlesPageFilters {
  query?: string
  view?: 'unfiled' | 'saved' | 'archived' | 'reading'
  folderIds?: string[]
  sourceFeedIds?: string[]
  tagIds?: string[]
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
// Powers all three lifecycle pages (Articles/Save/Archive) via `view`:
// 'unfiled' = no article_states row yet (default, the Articles page),
// 'saved'/'archived' = state matches exactly (the Save/Archive pages).
export async function getArticlesPage(filters: ArticlesPageFilters): Promise<ArticlesPageResult> {
  const user = await getUser()
  if (!user) return { items: [], nextCursor: null }

  const supabase = await createClient()
  const [states, folders] = await Promise.all([
    getArticleStatesMap(supabase, user),
    getArticleFoldersMap(supabase, user),
  ])
  const limit = filters.limit ?? ARTICLES_PAGE_LIMIT
  const view = filters.view ?? 'unfiled'

  // Unfiled articles never have a curation row, so they can never carry
  // tags — a tag filter combined with the unfiled view is definitionally
  // empty rather than a query worth running.
  const hasTagFilter = !!filters.tagIds && filters.tagIds.length > 0
  if (hasTagFilter && view === 'unfiled') {
    return { items: [], nextCursor: null }
  }

  // A tag filter needs the specific (state, tag) intersection, which stays
  // small in practice (a tag narrows things down) — kept as an id list.
  // Everything else routes through feed_items_excluding_states/with_state,
  // which do the state membership test as a real SQL join instead of
  // interpolating every matching id into the request URL — that's what
  // broke once article_states grew past a few hundred rows (see the
  // migration that added those functions). Multiple selected tags union
  // together (OR), matching how folder/source multi-select already works.
  let includeIds: string[] | null = null
  if (hasTagFilter) {
    includeIds = [...states.entries()]
      .filter(([, info]) => info.state === view && filters.tagIds!.some((tag) => info.tags.includes(tag)))
      .map(([id]) => id)
  }

  let query
  if (includeIds !== null) {
    if (includeIds.length === 0) return { items: [], nextCursor: null }
    query = supabase.from('feed_items').select(ARTICLE_SELECT).in('id', includeIds)
  } else if (view === 'unfiled') {
    query = feedItemsRpc(supabase, 'feed_items_excluding_states', {
      p_user_id: user.id,
      p_exclude_states: ['saved', 'archived', 'reading'],
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

  if (filters.sourceFeedIds && filters.sourceFeedIds.length > 0) {
    query = query.in('feed_id', filters.sourceFeedIds)
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
  // the user's point of view. Multiple selected folders union together
  // "for free": both lookups already collect ids into flat arrays before
  // the final .or(), so switching .eq -> .in just widens each array to
  // every feed/article belonging to ANY selected folder.
  if (filters.folderIds && filters.folderIds.length > 0) {
    const [{ data: feedFolderRows, error: feedFolderError }, { data: articleFolderRows, error: articleFolderError }] =
      await Promise.all([
        supabase.from('feed_folders').select('feed_id').in('folder_id', filters.folderIds),
        supabase.from('article_folders').select('feed_item_id').in('folder_id', filters.folderIds),
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

  query = query
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })

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
  const { data, error } = await supabase
    .from('feeds')
    .select('id, title')
    .is('deleted_at', null)
    .order('title')
  logQueryError('dashboard/listFeeds', error)
  return data ?? []
}
