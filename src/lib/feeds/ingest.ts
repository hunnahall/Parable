import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { after } from 'next/server'
import Parser from 'rss-parser'
import { stripHtml, translateArticle } from '@/lib/translate'
import { summarizeArticle } from '@/lib/summarize'
import { prewarmArticleContent, prewarmArticleImage } from '@/lib/articles/content'
import { DEFAULT_LANGUAGE } from '@/lib/languages'
import { matchedAutoDeleteKeyword } from './autoDelete'
import { detectArticles } from './buildFeed'

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
// in the chain (same root cause as the dashboard query bug fixed
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
// The background content-prewarm pass (see the translate_enabled branch in
// processItem/runIngest below) is a live scrape of an external site per
// item, same as the reading view's own lazy fetch — kept low so an ingest
// run with a lot of new items on translate-disabled feeds doesn't hammer
// several hosts at once.
const PREWARM_CONCURRENCY = 3

// Runs `fn` over `items` with at most `limit` calls in flight at once.
// Order of results matches `items`; order of completion doesn't.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  async function worker() {
    for (;;) {
      const i = nextIndex++
      if (i >= items.length) return
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
}

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

// Ingest is a single shared background job, not scoped to a request or
// signed-in user — same assumption the rest of the app's admin-client jobs
// already make (see performFullReset in src/lib/settings/actions.ts): only
// one account exists on this project today, so "the" row in
// user_preferences, if any, is that account's settings. autoDeleteKeywords
// comes back empty whenever the feature is off, so callers never need to
// check the enabled flag separately.
async function loadIngestPreferences(
  supabase: AdminClient
): Promise<{ targetLanguage: string; autoDeleteKeywords: string[] }> {
  const { data } = await supabase
    .from('user_preferences')
    .select('language, auto_delete_enabled, auto_delete_keywords')
    .maybeSingle()

  return {
    targetLanguage: data?.language ?? DEFAULT_LANGUAGE,
    autoDeleteKeywords: data?.auto_delete_enabled ? (data.auto_delete_keywords ?? []) : [],
  }
}

// summarize_articles is per-feed, not a global setting (see
// FeedRow.summarize_articles in src/lib/feeds/data.ts and the toggle in
// FeedManager/BuildFeedSection) — AI summaries are worth the OpenAI call
// on some feeds and not others, not an account-wide on/off.
type FeedRow = {
  id: string
  url: string
  title: string | null
  is_scraped: boolean
  summarize_articles: boolean
  // Per-feed opt-out from all translation (ingest-time title/summary and
  // reading-view full-content alike) — see setFeedTranslateEnabled in
  // src/lib/feeds/actions.ts and the checkbox in FeedManager.tsx. Off
  // guarantees this feed's articles never trigger an OpenAI translate
  // call, which is what makes eagerly pre-caching their content below
  // safe (no speculative API cost, only a scrape).
  translate_enabled: boolean
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
  targetLanguage: string,
  autoDeleteKeywords: string[]
): Promise<{
  inserted: boolean
  autoDeleted: boolean
  prewarm: PrewarmTarget | null
  prewarmImage: PrewarmTarget | null
}> {
  try {
    const rawTitle = item.title ?? ''
    const rawSummary = item.content ?? item.summary ?? item.contentSnippet ?? ''

    // translateArticle() re-strips these same raw strings internally —
    // passing it the same raw HTML that stripHtml() cleans here keeps the
    // stored title/summary and the detected/translated text based on
    // identical input. Skipped entirely for a translate_enabled=false
    // feed — see the FeedRow.translate_enabled comment above — rather
    // than just letting franc's language detection decide, since a
    // false-positive detection on short/ambiguous text would otherwise
    // still trigger a translate-on-open attempt later.
    const { original_language, title_en, summary_en } = feed.translate_enabled
      ? await translateArticle(rawTitle, rawSummary, targetLanguage)
      : { original_language: null, title_en: null, summary_en: null }

    // Auto-delete runs after translation (so a keyword typed in the user's
    // target language matches a title that's now in that language,
    // regardless of what language the article was actually published in)
    // but before summarization (so a discarded article never pays for the
    // second OpenAI call).
    const titleForMatching = title_en ?? stripHtml(rawTitle)
    if (matchedAutoDeleteKeyword(titleForMatching, autoDeleteKeywords)) {
      return { inserted: false, autoDeleted: true, prewarm: null, prewarmImage: null }
    }

    // Off by default per feed (see FeedRow.summarize_articles) — the
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
          // Copied from the feed at insert time rather than looked up
          // per-open — same pattern as summary_ai/feed.summarize_articles
          // above. A later toggle of the feed's checkbox only affects
          // items ingested after that point, not ones already sitting in
          // the inbox.
          translate_enabled: feed.translate_enabled,
        },
        { onConflict: 'feed_id,guid', ignoreDuplicates: true }
      )
      .select('id')

    if (insertError) {
      throw new Error(`Failed to insert item: ${insertError.message}`)
    }

    // Only set on a genuine insert (upserted is empty when ignoreDuplicates
    // skipped a same-run race — see the comment above) and only for a
    // translate_enabled=false feed, since that's what guarantees the
    // prewarm scrape below can't be followed by a wasted OpenAI call.
    const insertedId = upserted?.[0]?.id as string | undefined
    const prewarm: PrewarmTarget | null =
      !feed.translate_enabled && insertedId && item.link
        ? { feedItemId: insertedId, link: item.link }
        : null
    // A translate-enabled feed skips the full prewarm above, but a cover
    // image has no OpenAI cost either way — fetch just the header image
    // for these too (unless the RSS item already carried its own image),
    // rather than leaving every item on the favicon fallback until opened.
    const prewarmImage: PrewarmTarget | null =
      feed.translate_enabled && !item.imageUrl && insertedId && item.link
        ? { feedItemId: insertedId, link: item.link }
        : null

    return { inserted: true, autoDeleted: false, prewarm, prewarmImage }
  } catch (itemErr) {
    // A single malformed item (missing/garbage fields) or a one-off insert
    // failure shouldn't sink the rest of an otherwise-healthy feed.
    console.error(
      `ingest-feeds: skipping item guid=${guid} in feed ${feed.id} (${feed.url})`,
      itemErr
    )
    return { inserted: false, autoDeleted: false, prewarm: null, prewarmImage: null }
  }
}

type FeedResult =
  | {
      ok: true
      itemsInserted: number
      itemsAutoDeleted: number
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
  targetLanguage: string,
  autoDeleteKeywords: string[]
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
      processItem(supabase, feed, item, guid, targetLanguage, autoDeleteKeywords)
    )

    const itemsInserted = results.filter((r) => r.inserted).length
    const itemsAutoDeleted = results.filter((r) => r.autoDeleted).length
    const prewarmTargets = results.flatMap((r) => (r.prewarm ? [r.prewarm] : []))
    const prewarmImageTargets = results.flatMap((r) => (r.prewarmImage ? [r.prewarmImage] : []))

    const { error: updateError } = await supabase
      .from('feeds')
      .update({ last_fetched_at: new Date().toISOString(), last_error: null, consecutive_failures: 0 })
      .eq('id', feed.id)

    if (updateError) {
      throw new Error(`Failed to update last_fetched_at: ${updateError.message}`)
    }

    return { ok: true, itemsInserted, itemsAutoDeleted, prewarmTargets, prewarmImageTargets }
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
  const [{ data: feeds, error: feedsError }, { targetLanguage, autoDeleteKeywords }] =
    await Promise.all([
      supabase
        .from('feeds')
        .select('id, url, title, is_scraped, summarize_articles, translate_enabled, consecutive_failures')
        .is('deleted_at', null),
      loadIngestPreferences(supabase),
    ])

  if (feedsError) {
    throw new Error(`Failed to load feeds: ${feedsError.message}`)
  }

  const results = await mapWithConcurrency(feeds ?? [], FEED_CONCURRENCY, (feed) =>
    processFeed(supabase, feed, cutoffMs, targetLanguage, autoDeleteKeywords)
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
      itemsAutoDeleted += result.itemsAutoDeleted
      prewarmTargets.push(...result.prewarmTargets)
      prewarmImageTargets.push(...result.prewarmImageTargets)
    } else {
      feedsFailed.push(result.failure)
    }
  }

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
