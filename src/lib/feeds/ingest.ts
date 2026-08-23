import { createClient, SupabaseClient } from '@supabase/supabase-js'
import Parser from 'rss-parser'
import { stripHtml, translateArticle } from '@/lib/translate'
import { summarizeArticle } from '@/lib/summarize'
import { DEFAULT_LANGUAGE } from '@/lib/languages'

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

// Case-insensitive substring match — deliberately simple (no word-boundary
// handling) so "soccer" also catches "soccer-related", matching how a user
// thinks about a blocklist.
function matchedAutoDeleteKeyword(title: string, keywords: string[]): string | null {
  const lowerTitle = title.toLowerCase()
  for (const keyword of keywords) {
    const needle = keyword.trim().toLowerCase()
    if (needle && lowerTitle.includes(needle)) return keyword
  }
  return null
}

type FeedRow = { id: string; url: string; title: string | null }
type RssItem = Awaited<ReturnType<Parser['parseURL']>>['items'][number]

async function processItem(
  supabase: AdminClient,
  feed: FeedRow,
  item: RssItem,
  guid: string,
  targetLanguage: string,
  autoDeleteKeywords: string[]
): Promise<{ inserted: boolean; autoDeleted: boolean }> {
  try {
    const rawTitle = item.title ?? ''
    const rawSummary = item.content ?? item.summary ?? item.contentSnippet ?? ''

    // translateArticle() re-strips these same raw strings internally —
    // passing it the same raw HTML that stripHtml() cleans here keeps the
    // stored title/summary and the detected/translated text based on
    // identical input.
    const { original_language, title_en, summary_en } = await translateArticle(
      rawTitle,
      rawSummary,
      targetLanguage
    )

    // Auto-delete runs after translation (so a keyword typed in the user's
    // target language matches a title that's now in that language,
    // regardless of what language the article was actually published in)
    // but before summarization (so a discarded article never pays for the
    // second OpenAI call).
    const titleForMatching = title_en ?? stripHtml(rawTitle)
    if (matchedAutoDeleteKeyword(titleForMatching, autoDeleteKeywords)) {
      return { inserted: false, autoDeleted: true }
    }

    const summary_ai = await summarizeArticle(
      title_en ?? stripHtml(rawTitle),
      summary_en ?? stripHtml(rawSummary),
      targetLanguage
    )

    // upsert + ignoreDuplicates rather than a plain insert: if this run
    // overlaps another (cron firing while "Run ingest now" is also
    // mid-flight for the same feed), both can pass the existingGuids check
    // for the same new item before either has inserted. A plain insert
    // would then fail on the (feed_id, guid) unique constraint; ignoring
    // the duplicate instead just no-ops that one row.
    const { error: insertError } = await supabase.from('feed_items').upsert(
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
      },
      { onConflict: 'feed_id,guid', ignoreDuplicates: true }
    )

    if (insertError) {
      throw new Error(`Failed to insert item: ${insertError.message}`)
    }

    return { inserted: true, autoDeleted: false }
  } catch (itemErr) {
    // A single malformed item (missing/garbage fields) or a one-off insert
    // failure shouldn't sink the rest of an otherwise-healthy feed.
    console.error(
      `ingest-feeds: skipping item guid=${guid} in feed ${feed.id} (${feed.url})`,
      itemErr
    )
    return { inserted: false, autoDeleted: false }
  }
}

type FeedResult =
  | { ok: true; itemsInserted: number; itemsAutoDeleted: number }
  | { ok: false; failure: FeedFailure }

async function processFeed(
  supabase: AdminClient,
  feed: FeedRow,
  cutoffMs: number | null,
  targetLanguage: string,
  autoDeleteKeywords: string[]
): Promise<FeedResult> {
  // One Parser (and its internal xml2js instance) per feed rather than one
  // shared across all concurrent processFeed calls — cheap to construct,
  // and avoids relying on xml2js's string-parse callback happening to run
  // synchronously to keep concurrent parses from stepping on each other's
  // internal state.
  const parser = new Parser({
    timeout: FEED_FETCH_TIMEOUT_MS,
    headers: { 'User-Agent': FEED_USER_AGENT },
  })

  try {
    const parsed = await parser.parseURL(feed.url).catch((err) => {
      if (!isXmlParseError(err)) throw err
      return parseAndRepairFeed(parser, feed.url)
    })

    // Each RSS item needs a stable identifier to dedupe against. Most
    // feeds set <guid>; a handful only set <link>. If neither is present
    // there's nothing to key the unique (feed_id, guid) constraint on, so
    // that item is unprocessable — skip it rather than risk a
    // null/duplicate guid.
    const items = (parsed.items ?? [])
      .map((item) => ({ item, guid: item.guid ?? item.link ?? null }))
      .filter(
        (entry): entry is { item: (typeof parsed.items)[number]; guid: string } =>
          entry.guid !== null
      )
      // When a max age is set, an item with no parseable publish date
      // can't be confirmed to fall inside it — exclude rather than guess,
      // so "last 24 hours" doesn't silently let through whatever a feed
      // leaves undated.
      .filter((entry) => {
        if (cutoffMs === null) return true
        const publishedMs = entry.item.isoDate ? new Date(entry.item.isoDate).getTime() : NaN
        return !Number.isNaN(publishedMs) && publishedMs >= cutoffMs
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

    const { error: updateError } = await supabase
      .from('feeds')
      .update({ last_fetched_at: new Date().toISOString(), last_error: null })
      .eq('id', feed.id)

    if (updateError) {
      throw new Error(`Failed to update last_fetched_at: ${updateError.message}`)
    }

    return { ok: true, itemsInserted, itemsAutoDeleted }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`ingest-feeds: feed ${feed.id} (${feed.url}) failed:`, message)

    // Best-effort — a feed a user thinks they're covering could otherwise
    // stay silently broken indefinitely with nothing but a stale
    // last_fetched_at to notice (and even that isn't surfaced anywhere in
    // the UI today). Don't let a failure here mask the real error.
    const { error: errorUpdateError } = await supabase
      .from('feeds')
      .update({ last_error: message })
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
    await Promise.all([supabase.from('feeds').select('id, url, title'), loadIngestPreferences(supabase)])

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

  for (const result of results) {
    if (result.ok) {
      feedsProcessed++
      itemsInserted += result.itemsInserted
      itemsAutoDeleted += result.itemsAutoDeleted
    } else {
      feedsFailed.push(result.failure)
    }
  }

  return { feedsProcessed, feedsFailed, itemsInserted, itemsAutoDeleted }
}
