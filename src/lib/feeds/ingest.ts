import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { after } from 'next/server'
import Parser from 'rss-parser'
import { stripHtml, translateArticle } from '@/lib/translate'
import { summarizeArticle } from '@/lib/summarize'
import { prewarmArticleContent, prewarmArticleImage } from '@/lib/articles/content'
import { DEFAULT_LANGUAGE } from '@/lib/languages'
import { matchedAutoDeleteKeyword } from './autoDelete'
import { UNFILED_EXCLUDED_STATES } from '@/lib/articles/list'
import { detectArticles } from './buildFeed'
import { mapWithConcurrency } from '@/lib/concurrency'

const FEED_FETCH_TIMEOUT_MS = 15_000
// Some feeds put the full article body in <content:encoded>/<description>
// instead of a short snippet. This column is meant to hold a summary, not
// an unbounded copy of the article — the full body already gets cached
// separately (and purged) in article_content. Cap what we store here so a
// handful of such feeds can't quietly balloon feed_items forever.
const STORED_SUMMARY_MAX_LENGTH = 1500
// Some feeds (e.g. huggingface.co/blog, openai.com/news) publish their
// entire history in one unpaginated RSS file — 1000+ items. Checking
// which of those already exist by passing every guid into one `.in()`
// filter builds a request URL that blows past a length limit somewhere
// in the chain (same root cause as the article-list query bug fixed
// earlier), which is what "Failed to check existing items: Bad Request"
// / "fetch failed" actually were. Batching keeps each request small
// regardless of how large a feed's guid list is.
const EXISTING_GUID_CHECK_BATCH_SIZE = 200
// rss-parser's default User-Agent is the literal string "rss-parser" — a
// giveaway that gets it trivially blocked by bot-detection WAFs (this is
// very likely why IMF's feed 403s: server: AkamaiGHost, no other signal
// distinguishing this request from a browser's). Identifying honestly as
// a feed reader, the same convention Feedly/NewsBlur/etc. use, is enough
// to get past naive UA blocklists without pretending to be a browser.
const FEED_USER_AGENT = 'Mozilla/5.0 (compatible; ParableRSSReader/1.0; +https://github.com/hunnahall/Parable)'

// Fetching a feed and translating/summarizing an item are both pure I/O
// wait (network round trips, OpenAI calls) — running several at once cuts
// wall-clock ingest time roughly in proportion to the concurrency instead
// of paying for every feed and every item strictly back-to-back, which is
// what made a full cycle take ~30s even for a modest feed/item count.
// Kept modest to stay well clear of OpenAI's and any single feed host's
// per-connection rate limits.
const FEED_CONCURRENCY = 6
const ITEM_CONCURRENCY = 5
// The background content-prewarm pass (see the needsTranslation branch in
// processItem/runIngest below) is a live scrape of an external site per
// item, same as the reading view's own lazy fetch — kept low so an ingest
// run with a lot of new items in the user's own language doesn't hammer
// several hosts at once.
const PREWARM_CONCURRENCY = 3

// rss-parser's underlying XML parser (sax-js) always reports a parse
// failure with "Line: N" and "Column: N" in the message — a distinctive
// enough signature to tell "this feed's XML is malformed" apart from a
// network/HTTP failure, which is what parseAndRepairFeed below uses to
// decide whether a repair attempt is worth making.
function isXmlParseError(err: unknown): boolean {
  return err instanceof Error && /Line:\s*\d+/.test(err.message) && /Column:\s*\d+/.test(err.message)
}

// A small number of feeds (crisisgroup.org, tunisienumerique.com — both
// observed failing this way) leak raw, unescaped page boilerplate (a
// Google Tag Manager snippet, in crisisgroup's case) into an item field
// without CDATA-wrapping or entity-escaping it. A literal `&l=` in that
// snippet reads to an XML parser as the start of a malformed entity
// reference, which is what "Invalid character in entity name" actually
// is — a bug in the feed's own template, not anything about how we
// request it. Rather than failing the whole feed on it, retry once with
// stray `&` characters (any not already part of a real entity) escaped
// to `&amp;`. Only reached when parser.parseURL() already threw an
// XML-shaped error, so a healthy feed never pays for this extra fetch.
async function parseAndRepairFeed(parser: Parser, url: string) {
  const res = await fetch(url, {
    headers: { 'User-Agent': FEED_USER_AGENT },
    signal: AbortSignal.timeout(FEED_FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Status code ${res.status}`)
  const raw = await res.text()
  const repaired = raw.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;')
  return parser.parseString(repaired)
}

export interface FeedFailure {
  feedId: string
  url: string
  error: string
}

export interface IngestSummary {
  feedsProcessed: number
  feedsFailed: FeedFailure[]
  itemsInserted: number
  itemsAutoDeleted: number
}

type AdminClient = SupabaseClient

function adminClient(): AdminClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  )
}

// Ingest is one shared background job writing rows every subscriber
// reads, so it can't be driven by any single user's preferences.
// feed_items stores exactly one translation per item (title_en /
// summary_en), so the language it translates into is a project-level
// setting rather than a per-account one; per-account target languages
// would need a feed_item_translations table keyed by language.
//
// Auto-delete keywords are genuinely per-user and are applied after the
// fetch instead — see applyAutoDeleteRules below.
const INGEST_TARGET_LANGUAGE = process.env.INGEST_TARGET_LANGUAGE || DEFAULT_LANGUAGE

// summarize_articles is per-subscription, not a global setting (see
// FeedRow.summarize_articles in src/lib/feeds/data.ts and the toggle in
// FeedManager/BuildFeedSection). Since the summary is written to the
// shared feed_items row, it's generated when *any* subscriber wants it;
// bestSummary (src/lib/articles/list.ts) then gates whether each
// individual reader is shown it.
type FeedRow = {
  id: string
  url: string
  title: string | null
  is_scraped: boolean
  summarize_articles: boolean
  consecutive_failures: number
}
// Deliberately a small structural subset rather than rss-parser's own Item
// type: real feed items satisfy this shape as-is, and the entries
// synthesized from detectArticles() (see the is_scraped branch in
// processFeed below) only need to fill in exactly these fields to flow
// through the same translate/auto-delete/summarize/insert pipeline.
interface FeedEntryItem {
  title?: string
  link?: string
  guid?: string
  content?: string
  summary?: string
  contentSnippet?: string
  isoDate?: string
  imageUrl?: string
}

// rss-parser exposes <enclosure> out of the box; media:content/
// media:thumbnail (the other two common per-item image tags) need
// explicit customFields wiring. Checked in this priority order since
// enclosure is the most standard/reliable when present.
type RawFeedItem = Parser.Item & {
  mediaContent?: { $?: { url?: string } }
  mediaThumbnail?: { $?: { url?: string } }
}

function extractItemImage(item: RawFeedItem): string | undefined {
  return item.enclosure?.url ?? item.mediaContent?.$?.url ?? item.mediaThumbnail?.$?.url ?? undefined
}

interface PrewarmTarget {
  feedItemId: string
  link: string
}

async function processItem(
  supabase: AdminClient,
  feed: FeedRow,
  item: FeedEntryItem,
  guid: string,
  targetLanguage: string
): Promise<{
  inserted: boolean
  prewarm: PrewarmTarget | null
  prewarmImage: PrewarmTarget | null
}> {
  try {
    const rawTitle = item.title ?? ''
    const rawSummary = item.content ?? item.summary ?? item.contentSnippet ?? ''

    // translateArticle() re-strips these same raw strings internally —
    // passing it the same raw HTML that stripHtml() cleans here keeps the
    // stored title/summary and the detected/translated text based on
    // identical input. Always attempted (no per-feed opt-out) — it does
    // its own local language detection and skips the OpenAI call entirely
    // whenever the detected language already matches the target, so this
    // never pays for a translation nothing needed.
    const { original_language, title_en, summary_en } = await translateArticle(
      rawTitle,
      rawSummary,
      targetLanguage
    )

    // On only when at least one subscriber asked for it — the
    // OpenAI call this skips is the pipeline's one unconditional
    // per-article cost (unlike translation, which only fires for
    // non-target-language content); when it's off, feed_items.summary_ai
    // just stays null and article lists fall back to the feed's own
    // description instead.
    const summary_ai = feed.summarize_articles
      ? await summarizeArticle(
          title_en ?? stripHtml(rawTitle),
          summary_en ?? stripHtml(rawSummary),
          targetLanguage
        )
      : null

    // upsert + ignoreDuplicates rather than a plain insert: if this run
    // overlaps another (cron firing while "Run ingest now" is also
    // mid-flight for the same feed), both can pass the existingGuids check
    // for the same new item before either has inserted. A plain insert
    // would then fail on the (feed_id, guid) unique constraint; ignoring
    // the duplicate instead just no-ops that one row.
    const { data: upserted, error: insertError } = await supabase
      .from('feed_items')
      .upsert(
        {
          feed_id: feed.id,
          guid,
          title: stripHtml(rawTitle),
          link: item.link ?? null,
          summary: stripHtml(rawSummary).slice(0, STORED_SUMMARY_MAX_LENGTH),
          published_at: item.isoDate ?? null,
          original_language,
          title_en,
          summary_en,
          summary_ai,
          image_url: item.imageUrl ?? null,
        },
        { onConflict: 'feed_id,guid', ignoreDuplicates: true }
      )
      .select('id')

    if (insertError) {
      throw new Error(`Failed to insert item: ${insertError.message}`)
    }

    // Only set on a genuine insert (upserted is empty when ignoreDuplicates
    // skipped a same-run race — see the comment above) and only when this
    // item's own detected language already matches the target (or
    // couldn't be detected), since that's what guarantees the prewarm
    // scrape below can't be followed by a wasted OpenAI call. Full-body
    // translation itself never runs at ingest time — only lazily on open
    // (see /api/articles/[id]/content) or eagerly once an article is moved
    // to Reader (see moveToReader in src/lib/articles/actions.ts).
    const insertedId = upserted?.[0]?.id as string | undefined
    const needsTranslation = original_language !== targetLanguage && original_language !== 'und'
    const prewarm: PrewarmTarget | null =
      !needsTranslation && insertedId && item.link
        ? { feedItemId: insertedId, link: item.link }
        : null
    // An item needing translation skips the full prewarm above, but a
    // cover image has no OpenAI cost either way — fetch just the header
    // image for these too (unless the RSS item already carried its own
    // image), rather than leaving every item on the favicon fallback
    // until opened.
    const prewarmImage: PrewarmTarget | null =
      needsTranslation && !item.imageUrl && insertedId && item.link
        ? { feedItemId: insertedId, link: item.link }
        : null

    return { inserted: true, prewarm, prewarmImage }
  } catch (itemErr) {
    // A single malformed item (missing/garbage fields) or a one-off insert
    // failure shouldn't sink the rest of an otherwise-healthy feed.
    console.error(
      `ingest-feeds: skipping item guid=${guid} in feed ${feed.id} (${feed.url})`,
      itemErr
    )
    return { inserted: false, prewarm: null, prewarmImage: null }
  }
}

type FeedResult =
  | {
      ok: true
      itemsInserted: number
      prewarmTargets: PrewarmTarget[]
      prewarmImageTargets: PrewarmTarget[]
    }
  | { ok: false; failure: FeedFailure }

// Fetches+parses the feed's raw item list, before dedup/cutoff filtering.
// Two sources: a real RSS/Atom URL via rss-parser, or (for a "Build a
// Feed" entry — see src/lib/feeds/buildFeed.ts) a fresh re-scrape of the
// tracked page's current HTML, re-run every ingest rather than cached so
// it keeps working if the page's markup drifts slightly.
async function fetchFeedItems(feed: FeedRow): Promise<FeedEntryItem[]> {
  if (feed.is_scraped) {
    const result = await detectArticles(feed.url)
    if (result.error !== null) throw new Error(result.error)
    return result.preview.articles.map((a) => ({
      title: a.title,
      link: a.link,
      content: a.snippet ?? undefined,
      isoDate: a.publishedAt ?? undefined,
      imageUrl: a.imageUrl ?? undefined,
    }))
  }

  // One Parser (and its internal xml2js instance) per feed rather than one
  // shared across all concurrent processFeed calls — cheap to construct,
  // and avoids relying on xml2js's string-parse callback happening to run
  // synchronously to keep concurrent parses from stepping on each other's
  // internal state. customFields pulls in media:content/media:thumbnail,
  // which rss-parser doesn't expose by default (enclosure is already
  // built in) — see extractItemImage.
  const parser = new Parser({
    timeout: FEED_FETCH_TIMEOUT_MS,
    headers: { 'User-Agent': FEED_USER_AGENT },
    customFields: { item: [['media:content', 'mediaContent'], ['media:thumbnail', 'mediaThumbnail']] },
  })
  const parsed = await parser.parseURL(feed.url).catch((err) => {
    if (!isXmlParseError(err)) throw err
    return parseAndRepairFeed(parser, feed.url)
  })
  return (parsed.items ?? []).map((item) => ({ ...item, imageUrl: extractItemImage(item) }))
}

async function processFeed(
  supabase: AdminClient,
  feed: FeedRow,
  cutoffMs: number | null,
  targetLanguage: string
): Promise<FeedResult> {
  try {
    const rawItems = await fetchFeedItems(feed)

    // Each item needs a stable identifier to dedupe against. Most RSS
    // feeds set <guid>; a handful only set <link>; a scraped page has
    // nothing but its article links. If neither guid nor link is present
    // there's nothing to key the unique (feed_id, guid) constraint on, so
    // that item is unprocessable — skip it rather than risk a
    // null/duplicate guid.
    const items = rawItems
      .map((item) => ({ item, guid: item.guid ?? item.link ?? null }))
      .filter((entry): entry is { item: FeedEntryItem; guid: string } => entry.guid !== null)
      // When a max age is set, an item with no parseable publish date
      // can't be confirmed to fall inside or outside it — INCLUDE rather
      // than exclude, so a feed using a non-standard/relative date format
      // rss-parser can't normalize doesn't have its items silently
      // disappear from every manual "Run ingest now" run. (Previously
      // excluded undated items here, which meant a feed whose dates never
      // parse would look "empty" on manual runs forever — dedup-by-guid
      // above already prevents an included-but-actually-old item from
      // being a repeat problem.) Skipped entirely for scraped feeds:
      // detectArticles rarely finds a reliable date, so age-filtering them
      // would just drop everything on every manual run either way.
      .filter((entry) => {
        if (cutoffMs === null || feed.is_scraped) return true
        const publishedMs = entry.item.isoDate ? new Date(entry.item.isoDate).getTime() : NaN
        return Number.isNaN(publishedMs) || publishedMs >= cutoffMs
      })

    const existingGuids = new Set<string>()
    const guids = items.map((entry) => entry.guid)
    for (let i = 0; i < guids.length; i += EXISTING_GUID_CHECK_BATCH_SIZE) {
      const batch = guids.slice(i, i + EXISTING_GUID_CHECK_BATCH_SIZE)
      const { data: existing, error: existingError } = await supabase
        .from('feed_items')
        .select('guid')
        .eq('feed_id', feed.id)
        .in('guid', batch)

      if (existingError) {
        throw new Error(`Failed to check existing items: ${existingError.message}`)
      }

      for (const row of existing ?? []) existingGuids.add(row.guid)
    }

    const newItems = items.filter((entry) => !existingGuids.has(entry.guid))

    // Each item is inserted as soon as it's processed (inside processItem)
    // rather than buffering the whole feed's rows for one bulk insert at
    // the end — a large or first-time feed can have enough new items that
    // a mid-run crash/timeout (each item pays for up to two sequential
    // OpenAI calls) would otherwise discard every already-processed item
    // for this feed, and re-pay for the same OpenAI calls on the next run.
    const results = await mapWithConcurrency(newItems, ITEM_CONCURRENCY, ({ item, guid }) =>
      processItem(supabase, feed, item, guid, targetLanguage)
    )

    const itemsInserted = results.filter((r) => r.inserted).length
    const prewarmTargets = results.flatMap((r) => (r.prewarm ? [r.prewarm] : []))
    const prewarmImageTargets = results.flatMap((r) => (r.prewarmImage ? [r.prewarmImage] : []))

    const { error: updateError } = await supabase
      .from('feeds')
      .update({ last_fetched_at: new Date().toISOString(), last_error: null, consecutive_failures: 0 })
      .eq('id', feed.id)

    if (updateError) {
      throw new Error(`Failed to update last_fetched_at: ${updateError.message}`)
    }

    return { ok: true, itemsInserted, prewarmTargets, prewarmImageTargets }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`ingest-feeds: feed ${feed.id} (${feed.url}) failed:`, message)

    // Best-effort — a feed a user thinks they're covering could otherwise
    // stay silently broken indefinitely with nothing but a stale
    // last_fetched_at to notice. consecutive_failures lets the UI flag a
    // feed that's been failing for a while (see FeedManager.tsx) rather
    // than just showing the latest error with no sense of how long it's
    // been stuck.
    const { error: errorUpdateError } = await supabase
      .from('feeds')
      .update({ last_error: message, consecutive_failures: feed.consecutive_failures + 1 })
      .eq('id', feed.id)
    if (errorUpdateError) {
      console.error(
        `ingest-feeds: failed to record last_error for feed ${feed.id}:`,
        errorUpdateError.message
      )
    }

    return { ok: false, failure: { feedId: feed.id, url: feed.url, error: message } }
  }
}

// Applies each user's own Filters list (see FiltersForm) to whatever this
// run just added to their inbox. Runs per user, after the fetch, rather
// than inline during ingest: the keywords are per-account but feed_items
// rows are shared by every subscriber, so a match can only ever hide the
// article from the user who wrote the keyword — never delete it out from
// under anyone else. Writes the same 'deleted' tombstone the manual "Run
// filters now" action does (see runAutoDeleteRulesNow in
// src/lib/settings/actions.ts).
async function applyAutoDeleteRules(supabase: AdminClient): Promise<number> {
  const { data: prefRows, error: prefsError } = await supabase
    .from('user_preferences')
    .select('user_id, auto_delete_keywords')
    .eq('auto_delete_enabled', true)
  if (prefsError) {
    console.error('ingest: failed to load auto-delete preferences', prefsError.message)
    return 0
  }

  let tombstoned = 0
  const now = new Date().toISOString()

  for (const prefs of prefRows ?? []) {
    const keywords: string[] = prefs.auto_delete_keywords ?? []
    if (keywords.length === 0) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see feedItemsRpc in src/lib/articles/list.ts
    const rpc = supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => any
    const { data: items, error: itemsError } = await rpc('feed_items_excluding_states', {
      p_user_id: prefs.user_id,
      p_exclude_states: UNFILED_EXCLUDED_STATES,
    }).select('id, title, title_en')
    if (itemsError) {
      console.error(`ingest: auto-delete lookup failed for ${prefs.user_id}`, itemsError.message)
      continue
    }

    const matchedIds = ((items ?? []) as { id: string; title: string; title_en: string | null }[])
      .filter((item) => matchedAutoDeleteKeyword(item.title_en ?? item.title, keywords))
      .map((item) => item.id)
    if (matchedIds.length === 0) continue

    const { error: writeError } = await supabase.from('article_states').upsert(
      matchedIds.map((feedItemId) => ({
        user_id: prefs.user_id,
        feed_item_id: feedItemId,
        state: 'deleted',
        archived_at: now,
      })),
      { onConflict: 'user_id,feed_item_id' }
    )
    if (writeError) {
      console.error(`ingest: auto-delete write failed for ${prefs.user_id}`, writeError.message)
      continue
    }
    tombstoned += matchedIds.length
  }

  return tombstoned
}

// Shared by the cron-triggered /api/ingest-feeds route and the "Run ingest
// now" button in the feeds management UI (src/lib/feeds/actions.ts), so
// both paths run the exact same logic instead of drifting apart. The cron
// route calls this with no options (unbounded — same as always); only
// runIngestNow passes maxAgeHours, so a manual run doesn't backfill a
// feed's entire history the first time it's triggered.
export async function runIngest(opts: { maxAgeHours?: number } = {}): Promise<IngestSummary> {
  const supabase = adminClient()
  const cutoffMs = opts.maxAgeHours != null ? Date.now() - opts.maxAgeHours * 60 * 60 * 1000 : null

  // Independent of each other — run together instead of paying for two
  // sequential round trips before any feed work can start.
  // Only feeds someone actually subscribes to are worth fetching, and a
  // feed's AI-summary setting is the union of its subscribers' choices.
  const { data: subs, error: subsError } = await supabase
    .from('subscriptions')
    .select('feed_id, summarize_articles')
  if (subsError) {
    throw new Error(`Failed to load subscriptions: ${subsError.message}`)
  }

  const summarizeByFeed = new Map<string, boolean>()
  for (const sub of subs ?? []) {
    if (sub.summarize_articles) summarizeByFeed.set(sub.feed_id, true)
  }
  const subscribedFeedIds = [...new Set((subs ?? []).map((sub) => sub.feed_id))]

  if (subscribedFeedIds.length === 0) {
    return { feedsProcessed: 0, feedsFailed: [], itemsInserted: 0, itemsAutoDeleted: 0 }
  }

  const { data: catalogFeeds, error: feedsError } = await supabase
    .from('feeds')
    .select('id, url, title, is_scraped, consecutive_failures')
    .in('id', subscribedFeedIds)
    .is('deleted_at', null)

  if (feedsError) {
    throw new Error(`Failed to load feeds: ${feedsError.message}`)
  }

  const feeds = (catalogFeeds ?? []).map((feed) => ({
    ...feed,
    summarize_articles: summarizeByFeed.get(feed.id) ?? false,
  }))

  const results = await mapWithConcurrency(feeds, FEED_CONCURRENCY, (feed) =>
    processFeed(supabase, feed, cutoffMs, INGEST_TARGET_LANGUAGE)
  )

  let feedsProcessed = 0
  let itemsInserted = 0
  let itemsAutoDeleted = 0
  const feedsFailed: FeedFailure[] = []
  const prewarmTargets: PrewarmTarget[] = []
  const prewarmImageTargets: PrewarmTarget[] = []

  for (const result of results) {
    if (result.ok) {
      feedsProcessed++
      itemsInserted += result.itemsInserted
      prewarmTargets.push(...result.prewarmTargets)
      prewarmImageTargets.push(...result.prewarmImageTargets)
    } else {
      feedsFailed.push(result.failure)
    }
  }

  itemsAutoDeleted = await applyAutoDeleteRules(supabase)

  // Scheduled to run after this request's response is sent (see Next's
  // `after`) rather than awaited here — a live scrape per item would
  // otherwise stretch every ingest cycle (cron and "Run ingest now" alike)
  // by however long these translate-disabled feeds' new items take to
  // fetch, defeating the point of pre-caching them ahead of a user ever
  // opening one.
  if (prewarmTargets.length > 0) {
    after(() =>
      mapWithConcurrency(prewarmTargets, PREWARM_CONCURRENCY, (target) =>
        prewarmArticleContent(supabase, target.feedItemId, target.link)
      )
    )
  }

  // Same deferred-after-response treatment as the full-content prewarm
  // above, kept as a separate pass since it targets a different (usually
  // larger) set of items — every translate-enabled feed's new items, not
  // just translate-disabled ones — and is cheap enough on its own not to
  // need folding into that pass's concurrency budget.
  if (prewarmImageTargets.length > 0) {
    after(() =>
      mapWithConcurrency(prewarmImageTargets, PREWARM_CONCURRENCY, (target) =>
        prewarmArticleImage(supabase, target.feedItemId, target.link)
      )
    )
  }

  return { feedsProcessed, feedsFailed, itemsInserted, itemsAutoDeleted }
}
