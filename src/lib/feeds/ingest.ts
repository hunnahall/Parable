import { createClient } from '@supabase/supabase-js'
import Parser from 'rss-parser'
import { stripHtml, translateArticle } from '@/lib/translate'
import { summarizeArticle } from '@/lib/summarize'

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
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  )
}

// Shared by the cron-triggered /api/ingest-feeds route and the "Run ingest
// now" button in the feeds management UI (src/lib/feeds/actions.ts), so
// both paths run the exact same logic instead of drifting apart. The cron
// route calls this with no options (unbounded — same as always); only
// runIngestNow passes maxAgeHours, so a manual run doesn't backfill a
// feed's entire history the first time it's triggered.
export async function runIngest(opts: { maxAgeHours?: number } = {}): Promise<IngestSummary> {
  const supabase = adminClient()
  const parser = new Parser({
    timeout: FEED_FETCH_TIMEOUT_MS,
    headers: { 'User-Agent': FEED_USER_AGENT },
  })
  const cutoffMs = opts.maxAgeHours != null ? Date.now() - opts.maxAgeHours * 60 * 60 * 1000 : null

  const { data: feeds, error: feedsError } = await supabase
    .from('feeds')
    .select('id, url, title')

  if (feedsError) {
    throw new Error(`Failed to load feeds: ${feedsError.message}`)
  }

  let feedsProcessed = 0
  let itemsInserted = 0
  const feedsFailed: FeedFailure[] = []

  for (const feed of feeds ?? []) {
    try {
      const parsed = await parser.parseURL(feed.url).catch((err) => {
        if (!isXmlParseError(err)) throw err
        return parseAndRepairFeed(parser, feed.url)
      })

      // Each RSS item needs a stable identifier to dedupe against. Most
      // feeds set <guid>; a handful only set <link>. If neither is
      // present there's nothing to key the unique (feed_id, guid)
      // constraint on, so that item is unprocessable — skip it rather
      // than risk a null/duplicate guid.
      const items = (parsed.items ?? [])
        .map((item) => ({ item, guid: item.guid ?? item.link ?? null }))
        .filter(
          (entry): entry is { item: (typeof parsed.items)[number]; guid: string } =>
            entry.guid !== null
        )
        // When a max age is set, an item with no parseable publish date
        // can't be confirmed to fall inside it — exclude rather than
        // guess, so "last 24 hours" doesn't silently let through whatever
        // a feed leaves undated.
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
          throw new Error(
            `Failed to check existing items: ${existingError.message}`
          )
        }

        for (const row of existing ?? []) existingGuids.add(row.guid)
      }

      const newItems = items.filter((entry) => !existingGuids.has(entry.guid))

      let itemsInsertedForFeed = 0

      for (const { item, guid } of newItems) {
        try {
          const rawTitle = item.title ?? ''
          const rawSummary = item.content ?? item.summary ?? item.contentSnippet ?? ''

          // translateArticle() re-strips these same raw strings internally —
          // passing it the same raw HTML that stripHtml() cleans here keeps
          // the stored title/summary and the detected/translated text based
          // on identical input.
          const { original_language, title_en, summary_en } =
            await translateArticle(rawTitle, rawSummary)

          const summary_ai = await summarizeArticle(
            title_en ?? stripHtml(rawTitle),
            summary_en ?? stripHtml(rawSummary)
          )

          // Insert each item as soon as it's processed rather than
          // buffering the whole feed's rows in memory for one bulk insert
          // at the end of the loop — a large or first-time feed can have
          // enough new items that a mid-run crash/timeout (each item pays
          // for up to two sequential OpenAI calls) would otherwise discard
          // every already-processed item for this feed, and re-pay for the
          // same OpenAI calls on the next run.
          //
          // upsert + ignoreDuplicates rather than a plain insert: if this
          // run overlaps another (cron firing while "Run ingest now" is
          // also mid-flight for the same feed), both can pass the
          // existingGuids check above for the same new item before either
          // has inserted. A plain insert would then fail on the (feed_id,
          // guid) unique constraint; ignoring the duplicate instead just
          // no-ops that one row.
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

          itemsInsertedForFeed++
        } catch (itemErr) {
          // A single malformed item (missing/garbage fields) or a one-off
          // insert failure shouldn't sink the rest of an otherwise-healthy
          // feed.
          console.error(
            `ingest-feeds: skipping item guid=${guid} in feed ${feed.id} (${feed.url})`,
            itemErr
          )
        }
      }

      const { error: updateError } = await supabase
        .from('feeds')
        .update({ last_fetched_at: new Date().toISOString(), last_error: null })
        .eq('id', feed.id)

      if (updateError) {
        throw new Error(
          `Failed to update last_fetched_at: ${updateError.message}`
        )
      }

      feedsProcessed++
      itemsInserted += itemsInsertedForFeed
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`ingest-feeds: feed ${feed.id} (${feed.url}) failed:`, message)
      feedsFailed.push({ feedId: feed.id, url: feed.url, error: message })

      // Best-effort — a feed a user thinks they're covering could otherwise
      // stay silently broken indefinitely with nothing but a stale
      // last_fetched_at to notice (and even that isn't surfaced anywhere
      // in the UI today). Don't let a failure here mask the real error.
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
    }
  }

  return { feedsProcessed, feedsFailed, itemsInserted }
}
