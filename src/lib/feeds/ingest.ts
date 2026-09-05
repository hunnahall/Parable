import { createClient, SupabaseClient } from '@supabase/supabase-js'
import Parser from 'rss-parser'
import { stripHtml, translateArticle } from '@/lib/translate'
import { summarizeToTarget } from '@/lib/summarize'
import { fetchAndExtractContent, fetchHeaderImage } from '@/lib/articles/extract'
import { DEFAULT_LANGUAGE } from '@/lib/languages'
import { matchedAutoDeleteKeyword } from './autoDelete'
import { applyFilings, planFilings, type RuleRow } from '@/lib/filters/filing'
import { UNFILED_EXCLUDED_STATES } from '@/lib/articles/list'
import { detectArticles } from './buildFeed'
import { mapWithConcurrency } from '@/lib/concurrency'

const FEED_FETCH_TIMEOUT_MS = 15_000
// Below this, an extracted "body" is a cookie banner or a paywall stub
// rather than an article — summarizing it produces a worse result than
// summarizing the feed's own description, so that's what we fall back to.
const MIN_BODY_LENGTH = 500
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
// Every new item now costs a page fetch plus a summarization call, where
// it used to cost at most two short OpenAI calls — raised to keep
// wall-clock per feed roughly where it was despite the heavier per-item
// work. Still well clear of OpenAI's and any single host's rate limits.
const ITEM_CONCURRENCY = 8

// The route this runs under has a 300s ceiling (maxDuration in
// /api/ingest-feeds). A first run against a large backlog can easily
// exceed that, and being killed mid-flight would discard whatever was
// still in flight and re-pay for it next time. Stop *starting* new items
// at this mark instead and return cleanly: guids are deduped against
// feed_items, so the next cron run picks up exactly what was left.
const RUN_BUDGET_MS = 240_000

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

// Auto-delete keywords are per-user but feed_items rows are shared, so a
// feed carries every subscriber's list. An item whose title matches
// *every* subscriber's list is dropped before it costs a fetch or a
// summarization call — that is what "delete immediately without
// summarizing" means once more than one account can subscribe. An item
// matching only some subscribers' lists is still ingested and summarized
// for the others, then tombstoned for the ones who filtered it.
type FeedSubscriber = { userId: string; keywords: string[] }

type FeedRow = {
  id: string
  url: string
  title: string | null
  is_scraped: boolean
  subscribers: FeedSubscriber[]
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

// Everything Parable keeps about an article, in the order it becomes
// available. The body is fetched, read once, and never stored.
async function processItem(
  supabase: AdminClient,
  feed: FeedRow,
  item: FeedEntryItem,
  guid: string,
  targetLanguage: string
): Promise<{ inserted: boolean; feedItemId: string | null; title: string; titleEn: string | null }> {
  const skipped = { inserted: false, feedItemId: null, title: '', titleEn: null }
  try {
    const rawTitle = item.title ?? ''
    const rawSummary = item.content ?? item.summary ?? item.contentSnippet ?? ''

    // Step 1: translate the title. translateArticle does its own local
    // language detection and skips the OpenAI call entirely when the
    // detected language already matches the target, so this never pays for
    // a no-op translation.
    const { original_language, title_en } = await translateArticle(rawTitle, rawSummary, targetLanguage)
    const title = stripHtml(rawTitle)
    const matchTitle = title_en ?? title

    // Step 2: filter on the translated title, before anything expensive.
    // A title every subscriber has filtered never becomes a row at all.
    const filteredOutFor = feed.subscribers
      .filter((sub) => matchedAutoDeleteKeyword(matchTitle, sub.keywords) !== null)
      .map((sub) => sub.userId)
    if (filteredOutFor.length === feed.subscribers.length) {
      return skipped
    }

    // Step 3: read the article. The body only exists to be summarized —
    // it is never persisted, so a failure here is a quality regression
    // (summarize the feed's blurb instead), not an error.
    let bodyForSummary = stripHtml(rawSummary)
    let scrapedImage: string | null = null
    if (item.link) {
      const extracted = await fetchAndExtractContent(item.link)
      if ('text' in extracted && extracted.text.length >= MIN_BODY_LENGTH) {
        bodyForSummary = extracted.text
        scrapedImage = extracted.imageUrl
      } else if (!item.imageUrl) {
        // Extraction gave us nothing usable, but a cover image is a cheap
        // separate fetch and beats falling back to a favicon.
        scrapedImage = await fetchHeaderImage(item.link)
      }
    }

    // Step 4: two sentences, in the target language, in one call — see
    // summarizeToTarget for why translation isn't a second pass.
    const summary_ai = await summarizeToTarget(matchTitle, bodyForSummary, targetLanguage)

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
          title,
          link: item.link ?? null,
          published_at: item.isoDate ?? null,
          original_language,
          title_en,
          summary_ai,
          image_url: item.imageUrl ?? scrapedImage ?? null,
        },
        { onConflict: 'feed_id,guid', ignoreDuplicates: true }
      )
      .select('id')

    if (insertError) {
      throw new Error(`Failed to insert item: ${insertError.message}`)
    }

    // Empty when ignoreDuplicates skipped a same-run race (see above).
    const insertedId = (upserted?.[0]?.id as string | undefined) ?? null

    // Subscribers who filtered this title get a tombstone rather than the
    // article — it exists for the others, but never reaches their inbox.
    if (insertedId && filteredOutFor.length > 0) {
      const now = new Date().toISOString()
      const { error: tombstoneError } = await supabase.from('article_states').upsert(
        filteredOutFor.map((userId) => ({
          user_id: userId,
          feed_item_id: insertedId,
          state: 'deleted',
          archived_at: now,
        })),
        { onConflict: 'user_id,feed_item_id' }
      )
      if (tombstoneError) {
        console.error(`ingest: filter tombstone failed for ${insertedId}`, tombstoneError.message)
      }
    }

    return { inserted: true, feedItemId: insertedId, title, titleEn: title_en }
  } catch (itemErr) {
    // A single malformed item (missing/garbage fields) or a one-off insert
    // failure shouldn't sink the rest of an otherwise-healthy feed.
    console.error(
      `ingest-feeds: skipping item guid=${guid} in feed ${feed.id} (${feed.url})`,
      itemErr
    )
    return skipped
  }
}

// New rows this feed contributed, carried up so runIngest can apply each
// user's filing rules to them in one pass at the end.
export interface IngestedItem {
  id: string
  title: string
  title_en: string | null
}

type FeedResult =
  | { ok: true; itemsInserted: number; newItems: IngestedItem[] }
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
  cutoffMs: number,
  targetLanguage: string,
  deadline: number
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
      // An item with no parseable publish date can't be confirmed to fall
      // inside or outside the cutoff — INCLUDE rather than exclude, so a
      // feed using a non-standard/relative date format rss-parser can't
      // normalize doesn't have its items silently disappear from every
      // ingest run. (Previously excluded undated items here, which meant a
      // feed whose dates never parse would look "empty" forever —
      // dedup-by-guid above already prevents an included-but-actually-old
      // item from being a repeat problem.) Skipped entirely for scraped
      // feeds: detectArticles rarely finds a reliable date, so age-filtering
      // them would just drop everything on every run either way.
      .filter((entry) => {
        if (feed.is_scraped) return true
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
    // a mid-run crash/timeout (each item pays for a page fetch and an
    // OpenAI call) would otherwise discard every already-processed item
    // for this feed and re-pay for it on the next run.
    //
    // The deadline check is per item rather than per feed: once the run
    // budget is spent, remaining items are simply left for the next cron
    // pass, which finds them again because nothing was written for them.
    const results = await mapWithConcurrency(newItems, ITEM_CONCURRENCY, ({ item, guid }) => {
      if (Date.now() > deadline) {
        return Promise.resolve({ inserted: false, feedItemId: null, title: '', titleEn: null })
      }
      return processItem(supabase, feed, item, guid, targetLanguage)
    })

    const itemsInserted = results.filter((r) => r.inserted).length
    const newRows: IngestedItem[] = results.flatMap((r) =>
      r.feedItemId ? [{ id: r.feedItemId, title: r.title, title_en: r.titleEn }] : []
    )

    const { error: updateError } = await supabase
      .from('feeds')
      .update({ last_fetched_at: new Date().toISOString(), last_error: null, consecutive_failures: 0 })
      .eq('id', feed.id)

    if (updateError) {
      throw new Error(`Failed to update last_fetched_at: ${updateError.message}`)
    }

    return { ok: true, itemsInserted, newItems: newRows }
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

// A backstop pass over each user's whole inbox, not the primary filter —
// processItem already drops a matching title before it costs a fetch or a
// summarization call. This catches the cases that path can't: a keyword
// added after an article was already ingested, and an article ingested
// for one subscriber while another's list would have rejected it. Writes
// the same 'deleted' tombstone the manual "Run filters now" action does
// (see runAutoDeleteRulesNow in src/lib/settings/actions.ts).
async function applyAutoDeleteRules(supabase: AdminClient): Promise<number> {
  const { data: prefRows, error: prefsError } = await supabase
    .from('user_preferences')
    .select('user_id, auto_delete_keywords')
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
// both paths run the exact same logic instead of drifting apart — including
// this cutoff. Parable's own retention policy never keeps an article past
// 24h in the Inbox anyway (see runRetention), so ingesting anything older
// would just create work that gets discarded shortly after — including on
// a feed's very first fetch, which otherwise would backfill its entire
// history in one run.
const MAX_ITEM_AGE_HOURS = 24

export async function runIngest(): Promise<IngestSummary> {
  const supabase = adminClient()
  const cutoffMs = Date.now() - MAX_ITEM_AGE_HOURS * 60 * 60 * 1000
  const deadline = Date.now() + RUN_BUDGET_MS

  // Only feeds someone actually subscribes to are worth fetching. Each
  // feed also needs its subscribers' auto-delete keywords, so that an item
  // nobody wants can be dropped before it costs a fetch and an OpenAI call
  // (see processItem step 2).
  const [{ data: subs, error: subsError }, { data: prefRows, error: prefsError }] =
    await Promise.all([
      supabase.from('subscriptions').select('feed_id, user_id'),
      supabase.from('user_preferences').select('user_id, auto_delete_keywords'),
    ])
  if (subsError) {
    throw new Error(`Failed to load subscriptions: ${subsError.message}`)
  }
  if (prefsError) {
    // Not fatal: without keywords every item simply survives the filter
    // gate, which is the same outcome as nobody having any.
    console.error('ingest: failed to load auto-delete preferences', prefsError.message)
  }

  const keywordsByUser = new Map<string, string[]>(
    (prefRows ?? []).map((row) => [row.user_id as string, (row.auto_delete_keywords ?? []) as string[]])
  )

  const subscribersByFeed = new Map<string, FeedSubscriber[]>()
  for (const sub of subs ?? []) {
    const list = subscribersByFeed.get(sub.feed_id) ?? []
    list.push({ userId: sub.user_id, keywords: keywordsByUser.get(sub.user_id) ?? [] })
    subscribersByFeed.set(sub.feed_id, list)
  }
  const subscribedFeedIds = [...subscribersByFeed.keys()]

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
    subscribers: subscribersByFeed.get(feed.id) ?? [],
  }))

  const results = await mapWithConcurrency(feeds, FEED_CONCURRENCY, (feed) =>
    processFeed(supabase, feed, cutoffMs, INGEST_TARGET_LANGUAGE, deadline)
  )

  let feedsProcessed = 0
  let itemsInserted = 0
  const feedsFailed: FeedFailure[] = []
  const newItems: IngestedItem[] = []

  for (const result of results) {
    if (result.ok) {
      feedsProcessed++
      itemsInserted += result.itemsInserted
      newItems.push(...result.newItems)
    } else {
      feedsFailed.push(result.failure)
    }
  }

  // Filing rules run after the filter backstop, so a title matching both a
  // delete keyword and a rule is deleted rather than filed — the blocklist
  // is the stronger signal.
  const itemsAutoDeleted = await applyAutoDeleteRules(supabase)
  await applyFilterRules(supabase, newItems)

  return { feedsProcessed, feedsFailed, itemsInserted, itemsAutoDeleted }
}

// Applies each user's Rules block (see RulesBlock on /filters) to the rows
// this run just added. Runs once at the end rather than inline per item
// for the same reason auto-delete does: rules are per-account, feed_items
// rows are shared, and a rule can only ever file the article into the
// folder of the user who wrote it.
async function applyFilterRules(supabase: AdminClient, newItems: IngestedItem[]): Promise<void> {
  if (newItems.length === 0) return

  const { data: rules, error } = await supabase
    .from('filter_rules')
    .select('user_id, keyword, folder_id')
  if (error) {
    console.error('ingest: failed to load filter rules', error.message)
    return
  }
  if (!rules || rules.length === 0) return

  const rulesByUser = new Map<string, RuleRow[]>()
  for (const rule of rules) {
    const list = rulesByUser.get(rule.user_id) ?? []
    list.push({ keyword: rule.keyword, folder_id: rule.folder_id })
    rulesByUser.set(rule.user_id, list)
  }

  for (const [userId, userRules] of rulesByUser) {
    const filings = planFilings(newItems, userRules)
    const { error: writeError } = await applyFilings(supabase, userId, filings)
    if (writeError) console.error(`ingest: filing rules failed for ${userId}`, writeError)
  }
}
