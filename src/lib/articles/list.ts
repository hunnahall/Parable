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
  state: ArticleCuration | null
  note: string | null
  archivedAt: string | null
  // An article can be filed into several folders at once (article_folders'
  // PK is (feed_item_id, user_id, folder_id)) — folders replaced tags as
  // the app's single curation primitive.
  folderIds: string[]
  // Article-level image (enclosure/media:content/media:thumbnail captured
  // at ingest, or a scraped feed's detected image) — null for most feeds.
  // Card view (ArticleCardGrid) falls back to a favicon derived from
  // `link`'s origin when this is null.
  imageUrl: string | null
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

interface FeedMeta {
  title: string | null
}

// The displayed title comes from the caller's own subscription, falling
// back to the shared catalog row's title when they haven't renamed it (or
// no longer subscribe, which is still reachable for articles they saved
// before unsubscribing).
async function attachFeedMeta<T extends { feed_id: string }>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  items: T[],
  user: Awaited<ReturnType<typeof getUser>>
): Promise<Map<string, FeedMeta>> {
  const feedIds = [...new Set(items.map((item) => item.feed_id))]
  if (feedIds.length === 0) return new Map()

  const [{ data: feeds, error }, { data: subs, error: subsError }] = await Promise.all([
    supabase.from('feeds').select('id, title').in('id', feedIds),
    user
      ? supabase
          .from('subscriptions')
          .select('feed_id, title')
          .eq('user_id', user.id)
          .in('feed_id', feedIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  logQueryError('articles/attachFeedMeta', error)
  logQueryError('articles/attachFeedMeta (subscriptions)', subsError)

  const subByFeed = new Map(
    (subs ?? []).map((sub) => [sub.feed_id, sub as { title: string | null }])
  )

  return new Map(
    (feeds ?? []).map((feed) => {
      const sub = subByFeed.get(feed.id)
      return [feed.id, { title: sub?.title ?? feed.title }]
    })
  )
}

interface ArticleStateInfo {
  state: ArticleCuration
  note: string | null
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
    .select('feed_item_id, state, note, archived_at')
    .eq('user_id', resolvedUser.id)
  logQueryError('articles/getArticleStatesMap', error)

  return new Map(
    (data ?? []).map((row) => [
      row.feed_item_id,
      {
        state: row.state as ArticleCuration,
        note: row.note,
        archivedAt: row.archived_at,
      },
    ])
  )
}

// A user's per-article folder filing — separate from feed_folders
// (subscription organization), though both read from the same folders
// table. Many rows per (user, article): an article can sit in several
// folders at once. See getArticleStatesMap above for why `user` is optional.
async function getArticleFoldersMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user?: Awaited<ReturnType<typeof getUser>>
): Promise<Map<string, string[]>> {
  const resolvedUser = user !== undefined ? user : await getUser()
  if (!resolvedUser) return new Map()

  const { data, error } = await supabase
    .from('article_folders')
    .select('feed_item_id, folder_id')
    .eq('user_id', resolvedUser.id)
  logQueryError('articles/getArticleFoldersMap', error)

  const map = new Map<string, string[]>()
  for (const row of data ?? []) {
    const existing = map.get(row.feed_item_id)
    if (existing) existing.push(row.folder_id)
    else map.set(row.feed_item_id, [row.folder_id])
  }
  return map
}

// Every state article_states allows. Excluding all of them is exactly
// "has no curation row" — the Inbox's definition of unfiled. Kept as one
// constant so adding a state can't silently leak it into the Inbox.
export const UNFILED_EXCLUDED_STATES = ['saved', 'archived', 'deleted'] as const

const ARTICLE_SELECT =
  'id, feed_id, title, title_en, link, summary_ai, published_at, image_url'

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
  summary_ai: string | null
  published_at: string | null
  image_url: string | null
}

function toArticleItem(
  item: ArticleRow,
  feedMeta: Map<string, FeedMeta>,
  states: Map<string, ArticleStateInfo>,
  folders: Map<string, string[]> = new Map()
): ArticleItem {
  const info = states.get(item.id)
  const meta = feedMeta.get(item.feed_id)
  return {
    id: item.id,
    title: bestTitle(item),
    link: item.link,
    // The two-sentence summary ingest writes for every article. No
    // fallback to the feed's own description: the body it was generated
    // from is discarded at ingest, so summary_ai is the only summary that
    // exists (see src/lib/feeds/ingest.ts).
    summary: item.summary_ai,
    published_at: item.published_at,
    feed_title: meta?.title ?? null,
    state: info?.state ?? null,
    note: info?.note ?? null,
    archivedAt: info?.archivedAt ?? null,
    folderIds: folders.get(item.id) ?? [],
    imageUrl: item.image_url,
  }
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
  // The inbox is bounded (excludes saved/archived/deleted), so fetching ids
  // and counting them client-side is cheap and actually works.
  const { data, error } = await feedItemsRpc(supabase, 'feed_items_excluding_states', {
    p_user_id: user.id,
    p_exclude_states: UNFILED_EXCLUDED_STATES,
  }).select('id')
  logQueryError('articles/getArticlesUnfiledCount', error)
  return data?.length ?? 0
}

export interface ArticlesPageFilters {
  query?: string
  view?: 'unfiled' | 'saved' | 'archived'
  folderIds?: string[]
  sourceFeedIds?: string[]
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
// Powers all three lifecycle pages (Inbox/Save/Archive) via `view`:
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

  // Both branches route through feed_items_excluding_states/with_state,
  // which do the state membership test as a real SQL join instead of
  // interpolating every matching id into the request URL — that's what
  // broke once article_states grew past a few hundred rows (see the
  // migration that added those functions).
  let query
  if (view === 'unfiled') {
    query = feedItemsRpc(supabase, 'feed_items_excluding_states', {
      p_user_id: user.id,
      p_exclude_states: UNFILED_EXCLUDED_STATES,
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
    logQueryError('articles/getArticlesPage (folder feed lookup)', feedFolderError)
    logQueryError('articles/getArticlesPage (folder article lookup)', articleFolderError)

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
  logQueryError('articles/getArticlesPage', error)
  if (!rows) return { items: [], nextCursor: null }

  const hasMore = rows.length > limit
  const pageRows = hasMore ? rows.slice(0, limit) : rows

  const feedMeta = await attachFeedMeta(supabase, pageRows, user)
  const items = pageRows.map((item: ArticleRow) => toArticleItem(item, feedMeta, states, folders))

  const last = pageRows.at(-1)
  const nextCursor = hasMore && last?.published_at ? { publishedAt: last.published_at, id: last.id } : null

  return { items, nextCursor }
}

// Source-filter options on the list pages: your subscriptions, labelled
// with your own title override where you set one.
export async function listFeeds(): Promise<FeedOption[]> {
  const user = await getUser()
  if (!user) return []

  const supabase = await createClient()
  const { data: subs, error: subsError } = await supabase
    .from('subscriptions')
    .select('feed_id, title')
    .eq('user_id', user.id)
  logQueryError('articles/listFeeds (subscriptions)', subsError)

  const subscriptions = subs ?? []
  if (subscriptions.length === 0) return []

  const { data, error } = await supabase
    .from('feeds')
    .select('id, title')
    .in(
      'id',
      subscriptions.map((sub) => sub.feed_id)
    )
    .is('deleted_at', null)
    .order('title')
  logQueryError('articles/listFeeds', error)

  const overrides = new Map(subscriptions.map((sub) => [sub.feed_id, sub.title]))
  return (data ?? []).map((feed) => ({ id: feed.id, title: overrides.get(feed.id) ?? feed.title }))
}
