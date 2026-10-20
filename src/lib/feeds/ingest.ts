import { adminClient, type AdminClient } from '@/lib/supabase/admin'
import Parser from 'rss-parser'
import { detectLanguage, needsTranslation, stripHtml, translateTitles } from '@/lib/translate'
import { embedTexts } from '@/lib/embeddings'
import { fetchAndExtractContent, paragraphsOf } from '@/lib/articles/extract'
import { DEFAULT_LANGUAGE } from '@/lib/languages'
import { matchedAutoDeleteKeyword } from './autoDelete'
import { UNFILED_EXCLUDED_STATES } from '@/lib/articles/list'
import { detectArticles } from './buildFeed'
import { mapWithConcurrency } from '@/lib/concurrency'
import { addIngestUsage, EMPTY_INGEST_USAGE, EMPTY_USAGE, type IngestUsage } from '@/lib/usage/tokens'

const FEED_FETCH_TIMEOUT_MS = 15_000
// Below this, extracted text is a cookie banner, a paywall stub or a
// teaser rather than the article. The feed's own description is used
// instead when it is longer, and the stored text is marked as a teaser so
// the reader view can say so.
const MIN_BODY_LENGTH = 500
// Below this there is nothing worth showing at all.
const MIN_TEASER_LENGTH = 80
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

// Cross-feed duplicate detection: the same story from several feeds is
// recognized so the Inbox can group it.
//   'off' — don't embed, don't look up
//   'log' — embed and look up, log matches, record nothing
//   'on'  — record the match on the row (duplicate_of)
// Every match is logged either way, and DEDUPE_MODE=log in the environment
// pulls back without a deploy.
const DEDUPE_MODE = (process.env.DEDUPE_MODE ?? 'on') as 'off' | 'log' | 'on'
// Cosine distance, measured rather than guessed — see
// src/scripts/test-dedupe-threshold.ts, which is what produced these
// numbers against text-embedding-3-small at 512 dimensions:
//
//   0.0694  same wire story, two outlets rewording the headline
//   0.0813  same event, one headline carrying an extra detail
//   0.1500  same story reaching us from a French and an English source
//   ---
//   0.2226  "Central Bank Raises Rates" vs "...Holds Rates Steady"
//   0.4695  same institution, unrelated subject
//
// 0.16 sits above every true duplicate and well below that 0.2226 pair,
// which is the failure mode that matters: two headlines that are nearly
// identical lexically and opposite in meaning. Kept on the conservative
// side of the midpoint (0.1863): a false miss shows one story twice, a
// false match hides a different story inside another.
//
// Six hand-written pairs is a small sample. Re-run the script with pairs
// pulled from your own feeds before moving this, and read the
// near-duplicate lines in the ingest logs — those are real matches on real
// headlines, which is better evidence than anything invented here.
const DEDUPE_MAX_DISTANCE = Number(process.env.DEDUPE_MAX_DISTANCE ?? '0.16')
// Articles leave the Inbox 12h after ingest; a story picked up by a new
// feed within a day still belongs with the earlier coverage.
const DEDUPE_WINDOW_HOURS = 24

// Fetching a feed and reading an article are both mostly I/O
// wait (network round trips, OpenAI calls) — running several at once cuts
// wall-clock ingest time roughly in proportion to the concurrency instead
// of paying for every feed and every item strictly back-to-back, which is
// what made a full cycle take ~30s even for a modest feed/item count.
// Kept modest to stay well clear of OpenAI's and any single feed host's
// per-connection rate limits.
const FEED_CONCURRENCY = 6
// Every new item costs a page fetch and a Readability parse (no AI call).
const ITEM_CONCURRENCY = 8

// The route this runs under has a 300s ceiling (maxDuration in
// /api/ingest-feeds). A first run against a large backlog can easily
// exceed that, and being killed mid-flight would discard whatever was
// still in flight and re-pay for it next time. Stop *starting* new items
// at this mark instead and return cleanly: guids are deduped against
// ingested_guids, so the next cron run picks up exactly what was left.
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
  // New articles recognized as a story another feed already carried.
  duplicatesFound: number
  // Articles whose full text (not a teaser) was stored.
  textsStored: number
  // What this run spent at OpenAI: title translation and embeddings. See
  // src/lib/usage/tokens.ts.
  usage: IngestUsage
}

// Ingest is one shared background job writing rows every subscriber
// reads, so it can't be driven by any single user's preferences.
// feed_items stores exactly one translation per item (title_en), so the
// language it translates into is a project-level
// setting rather than a per-account one; per-account target languages
// would need a feed_item_translations table keyed by language.
//
// Auto-delete keywords are genuinely per-user and are applied after the
// fetch instead — see applyAutoDeleteRules below.
const INGEST_TARGET_LANGUAGE = process.env.INGEST_TARGET_LANGUAGE || DEFAULT_LANGUAGE

// Filter keywords are per-user but feed_items rows are shared, so a feed
// carries every subscriber's list. An item whose title matches *every*
// subscriber's list is dropped before it costs a fetch. An item matching
// only some subscribers' lists is ingested for the others and tombstoned
// for the ones who filtered it.
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
// through the same translate/filter/insert pipeline.
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

// One feed item after the local, free preparation steps (HTML stripping,
// language detection) and the batched ones (title translation, title
// embedding) have run. Everything here is known before the first expensive
// per-item call is made.
interface PreparedItem {
  item: FeedEntryItem
  guid: string
  title: string
  // The feed's own description, HTML-stripped. Used for language
  // detection, and as the stored text when it is already the whole
  // article (full-text feeds) or when extraction fails.
  feedSummary: string
  originalLanguage: string
  titleEn: string | null
  // titleEn ?? title — what filters match against and what gets embedded.
  matchTitle: string
  // Subscribers whose keyword list rejected this title. Empty for most
  // items; when it covers every subscriber the item is dropped before it
  // reaches processItem at all.
  filteredOutFor: string[]
  embedding: number[] | null
  // Set when the free exact-match check (identical link, or identical
  // title) already found this story under another feed; processItem then
  // skips the vector lookup.
  exactMatchId: string | null
}

type DuplicateMatch = {
  id: string
  title: string
  title_en: string | null
  distance: number
}

// What one item is assumed to cost in wall time before this run has
// measured any — a page fetch and a parse. Only used to size
// the first feed's preparation batch; every feed after that uses the real
// observed average.
const INITIAL_ITEM_MS = 3_000

// How fast this run is actually going, so a feed only pays to translate
// and embed the items the run can still write.
//
// prepareItems buys title translation and embeddings for a feed's entire
// new-item list up front, but processItem stops starting work at the
// deadline. Everything past that point was paid for and thrown away — and
// paid for again on the next run, which finds the same items untouched.
// The fix isn't a per-feed item cap (considered and declined: spend should
// scale with feed volume); it is not buying what this run demonstrably
// cannot use.
//
// Feeds are I/O-bound and run in parallel, so each one gets the full
// remaining wall clock at its own ITEM_CONCURRENCY. The average is
// measured under real contention, so it self-corrects as the run goes on.
// Erring low is cheap: deferred items are found again next run, because
// nothing was written for them.
class RunPace {
  private totalMs = 0
  private count = 0

  record(ms: number): void {
    this.totalMs += ms
    this.count += 1
  }

  private get averageMs(): number {
    return this.count === 0 ? INITIAL_ITEM_MS : this.totalMs / this.count
  }

  capacity(remainingMs: number): number {
    if (remainingMs <= 0) return 0
    return Math.max(1, Math.floor((remainingMs / this.averageMs) * ITEM_CONCURRENCY))
  }
}

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 1
  return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// What this run has already written, before any of it is visible to the
// database checks. Feeds run FEED_CONCURRENCY at a time, so the same wire
// story lands on several of them before any copy is in the database. Two
// items in flight at the same instant can still both miss.
class RunCache {
  private byKey = new Map<string, string>()
  private embedded: { embedding: number[]; id: string }[] = []

  find(prepared: PreparedItem): { id: string; distance: number } | null {
    if (DEDUPE_MODE === 'off') return null

    for (const key of this.keysOf(prepared)) {
      const id = this.byKey.get(key)
      if (id) return { id, distance: 0 }
    }

    if (!prepared.embedding) return null
    let best: { id: string; distance: number } | null = null
    for (const entry of this.embedded) {
      const distance = cosineDistance(prepared.embedding, entry.embedding)
      if (distance <= DEDUPE_MAX_DISTANCE && (!best || distance < best.distance)) {
        best = { id: entry.id, distance }
      }
    }
    return best
  }

  add(prepared: PreparedItem, id: string): void {
    for (const key of this.keysOf(prepared)) this.byKey.set(key, id)
    if (prepared.embedding) this.embedded.push({ embedding: prepared.embedding, id })
  }

  private keysOf(prepared: PreparedItem): string[] {
    const keys: string[] = []
    if (prepared.item.link) keys.push(`link:${prepared.item.link}`)
    if (prepared.matchTitle) keys.push(`title:${prepared.matchTitle}`)
    return keys
  }
}

// The free half of duplicate detection, run once per feed before anything
// is embedded: an identical link, or an identical title, against the same
// 24h window findDuplicate uses.
//
// A large share of real syndication isn't reworded: outlets republish wire
// copy under the agency's own headline, often behind the same canonical
// URL. Recognizing those needs no vector scan. Strictly stricter than the
// cosine threshold, so it never changes which matches happen.
//
// Returns a map keyed by the caller's index. Failures return an empty map.
async function findExactMatches(
  supabase: AdminClient,
  entries: PreparedItem[]
): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  if (DEDUPE_MODE === 'off' || entries.length === 0) return out

  const links = [...new Set(entries.map((e) => e.item.link).filter((l): l is string => !!l))]
  const titles = [...new Set(entries.map((e) => e.matchTitle).filter((t) => t.length > 0))]
  if (links.length === 0 && titles.length === 0) return out

  const since = new Date(Date.now() - DEDUPE_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase.rpc('find_exact_recent_feed_items', {
    p_links: links,
    p_titles: titles,
    p_since: since,
  })
  if (error) {
    console.error('ingest: exact duplicate lookup failed', error.message)
    return out
  }

  const rows = (data ?? []) as {
    id: string
    link: string | null
    title: string
    title_en: string | null
  }[]
  if (rows.length === 0) return out

  const byLink = new Map(rows.flatMap((row) => (row.link ? [[row.link, row] as const] : [])))
  const byTitle = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    // title_en first: it is what a translated item was matched on.
    if (row.title_en) byTitle.set(row.title_en, row)
    byTitle.set(row.title, row)
  }

  entries.forEach((entry, index) => {
    const row = (entry.item.link ? byLink.get(entry.item.link) : undefined) ?? byTitle.get(entry.matchTitle)
    if (row) out.set(index, row.id)
  })
  return out
}

// Nearest recent article carrying the same story. Null when dedupe is off,
// the embedding is missing, or nothing is close enough.
async function findDuplicate(
  supabase: AdminClient,
  prepared: PreparedItem
): Promise<DuplicateMatch | null> {
  if (DEDUPE_MODE === 'off' || !prepared.embedding) return null

  const since = new Date(Date.now() - DEDUPE_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase.rpc('find_similar_recent_feed_item', {
    // pgvector's text input format is exactly a JSON array, so stringifying
    // here avoids depending on how PostgREST would serialize a raw number[].
    p_embedding: JSON.stringify(prepared.embedding),
    p_max_distance: DEDUPE_MAX_DISTANCE,
    p_since: since,
  })
  if (error) {
    console.error('ingest: duplicate lookup failed', error.message)
    return null
  }

  const match = (data as DuplicateMatch[] | null)?.[0]
  return match ?? null
}

type ItemResult = {
  inserted: boolean
  feedItemId: string | null
  duplicate: boolean
  fullText: boolean
}

const SKIPPED: ItemResult = { inserted: false, feedItemId: null, duplicate: false, fullText: false }

type StoredText = { text: string; kind: 'full' | 'teaser' | 'none' }

// The article's text, read once at ingest so the reader view and summary
// can start without waiting on the publisher's site. No AI call. A
// full-text feed (content:encoded carrying the whole article) already
// holds it, so the page fetch is skipped there.
async function readArticle(
  prepared: PreparedItem
): Promise<{ stored: StoredText; imageUrl: string | null }> {
  const { item, feedSummary } = prepared
  if (feedSummary.length >= MIN_BODY_LENGTH || !item.link) {
    return { stored: textFrom(feedParagraphs(item, feedSummary), ''), imageUrl: null }
  }
  const extracted = await fetchAndExtractContent(item.link)
  const pageText = 'text' in extracted ? extracted.text : ''
  return { stored: textFrom(feedParagraphs(item, feedSummary), pageText), imageUrl: extracted.imageUrl }
}

// The feed's own description with its paragraphs kept (stripHtml flattens
// them, which is fine for detection but not for the reader view).
function feedParagraphs(item: FeedEntryItem, flattened: string): string {
  const html = item.content ?? item.summary
  if (!html || !html.includes('<')) return flattened
  return paragraphsOf(html, item.link ?? 'https://example.invalid/') || flattened
}

function textFrom(feedSummary: string, pageText: string): StoredText {
  if (pageText.length >= MIN_BODY_LENGTH) return { text: pageText, kind: 'full' }
  if (feedSummary.length >= MIN_BODY_LENGTH) return { text: feedSummary, kind: 'full' }
  const longer = pageText.length >= feedSummary.length ? pageText : feedSummary
  if (longer.length >= MIN_TEASER_LENGTH) return { text: longer, kind: 'teaser' }
  return { text: longer, kind: 'none' }
}

// Writes the article, its text, the seen-set entry and any filter
// tombstones.
async function writeItem(
  supabase: AdminClient,
  feed: FeedRow,
  prepared: PreparedItem,
  stored: StoredText,
  imageUrl: string | null,
  duplicateOf: string | null
): Promise<ItemResult> {
  const { item, guid, title, titleEn, filteredOutFor, originalLanguage } = prepared

  // upsert + ignoreDuplicates rather than a plain insert: a cron run and a
  // manual Sync can overlap and both pass the seen-set check for the same
  // new item. Ignoring the duplicate no-ops that one row.
  const { data: upserted, error: insertError } = await supabase
    .from('feed_items')
    .upsert(
      {
        feed_id: feed.id,
        guid,
        title,
        link: item.link ?? null,
        published_at: item.isoDate ?? null,
        original_language: originalLanguage,
        title_en: titleEn,
        duplicate_of: duplicateOf,
        image_url: item.imageUrl ?? imageUrl ?? null,
        // Stored even in 'log' mode: a later item can only match a row
        // whose embedding is populated.
        title_embedding: prepared.embedding ? JSON.stringify(prepared.embedding) : null,
      },
      { onConflict: 'feed_id,guid', ignoreDuplicates: true }
    )
    .select('id')

  if (insertError) {
    throw new Error(`Failed to insert item: ${insertError.message}`)
  }

  // Recorded per item, once the row is written, so a run killed mid-feed
  // doesn't forget what it already processed. Best-effort.
  const now = new Date().toISOString()
  const { error: guidError } = await supabase
    .from('ingested_guids')
    .upsert({ feed_id: feed.id, guid, last_seen_at: now }, { onConflict: 'feed_id,guid' })
  if (guidError) {
    console.error(`ingest: failed to record guid=${guid} for feed ${feed.id}`, guidError.message)
  }

  // Empty when ignoreDuplicates skipped a same-run race (see above).
  const insertedId = (upserted?.[0]?.id as string | undefined) ?? null
  if (!insertedId) return SKIPPED

  const { error: textError } = await supabase
    .from('feed_item_texts')
    .upsert({ feed_item_id: insertedId, text: stored.text, kind: stored.kind })
  if (textError) {
    console.error(`ingest: failed to store text for ${insertedId}`, textError.message)
  }

  // Subscribers who filtered this title get a tombstone rather than the
  // article: it exists for the others, but never reaches their Inbox.
  if (filteredOutFor.length > 0) {
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

  return {
    inserted: true,
    feedItemId: insertedId,
    duplicate: duplicateOf !== null,
    fullText: !textError && stored.kind === 'full',
  }
}

// The per-item half of ingest: which story this is, the article text, the
// write. Title translation and embedding already happened, batched across
// the feed (prepareItems).
async function processItem(
  supabase: AdminClient,
  feed: FeedRow,
  prepared: PreparedItem,
  runCache: RunCache
): Promise<ItemResult> {
  try {
    const { matchTitle } = prepared

    // Has another feed already carried this story? Cheapest check first:
    // the free exact match from prepareItems, then this run's own writes
    // (invisible to the database checks until committed), then the vector
    // lookup.
    let match: { id: string; distance: number; via: string; title?: string } | null = null
    if (prepared.exactMatchId) {
      match = { id: prepared.exactMatchId, distance: 0, via: 'exact' }
    } else {
      const inRun = runCache.find(prepared)
      if (inRun) {
        match = { ...inRun, via: 'same run' }
      } else {
        const found = await findDuplicate(supabase, prepared)
        if (found) match = { id: found.id, distance: found.distance, via: 'vector', title: found.title_en ?? found.title }
      }
    }
    if (match) {
      // The audit trail for every match: both titles, so a wrong one is
      // recognizable at a glance.
      console.log(
        `ingest: same story (${match.via}) d=${match.distance.toFixed(4)} ` +
          `from=${match.id}${DEDUPE_MODE === 'on' ? '' : ' (not recorded)'}\n` +
          `  this:  "${matchTitle}"` +
          (match.title ? `\n  match: "${match.title}"` : '')
      )
    }
    const duplicateOf = DEDUPE_MODE === 'on' && match ? match.id : null

    const { stored, imageUrl } = await readArticle(prepared)
    const result = await writeItem(supabase, feed, prepared, stored, imageUrl, duplicateOf)
    if (result.feedItemId) runCache.add(prepared, result.feedItemId)
    return result
  } catch (itemErr) {
    // A single malformed item or a one-off insert failure shouldn't sink
    // the rest of an otherwise healthy feed.
    console.error(
      `ingest-feeds: skipping item guid=${prepared.guid} in feed ${feed.id} (${feed.url})`,
      itemErr
    )
    return SKIPPED
  }
}

type FeedResult =
  | {
      ok: true
      itemsInserted: number
      duplicatesFound: number
      textsStored: number
      usage: IngestUsage
    }
  // A failed feed can still have spent tokens before it threw (a batch
  // translation followed by a failing insert), so usage is carried on
  // this arm too.
  | { ok: false; failure: FeedFailure; usage: IngestUsage }

// The free half of per-item work — HTML stripping and franc detection —
// followed by the two calls that are worth batching across the whole feed:
// title translation and title embedding.
//
// Translation used to be one API call per item, inside processItem. A
// headline is ~15 tokens, but every request also paid a developer prompt
// and gpt-5-nano's reasoning-token floor, so per-call overhead dominated —
// and with a majority-non-English feed list, most items paid it. One call
// per feed instead of one per item is the single biggest structural saving
// here, and it also removes ~n round trips from the run's time budget.
//
// Embedding is batched for the same reason and is nearly free besides
// ($0.02/1M against ~15 tokens a title). It runs on the *translated*
// title, which is what lets the same wire story collapse across languages.
async function prepareItems(
  supabase: AdminClient,
  entries: { item: FeedEntryItem; guid: string }[],
  feed: FeedRow,
  targetLanguage: string
): Promise<{ prepared: PreparedItem[]; usage: IngestUsage }> {
  const base = entries.map(({ item, guid }) => {
    const title = stripHtml(item.title ?? '')
    const feedSummary = stripHtml(item.content ?? item.summary ?? item.contentSnippet ?? '')
    return {
      item,
      guid,
      title,
      feedSummary,
      originalLanguage: detectLanguage(title, feedSummary),
    }
  })

  // Only the titles that actually need translating go into the batch —
  // detection is local and free, so an item already in the target language
  // still costs nothing.
  const toTranslate = base.flatMap((entry, index) =>
    needsTranslation(entry.originalLanguage, targetLanguage) ? [index] : []
  )
  const translated = await translateTitles(
    toTranslate.map((index) => base[index].title),
    targetLanguage
  )
  const titleEnByIndex = new Map<number, string | null>()
  toTranslate.forEach((index, i) => titleEnByIndex.set(index, translated.titles[i]))

  const gated = base.flatMap((entry, index) => {
    const titleEn = titleEnByIndex.get(index) ?? null
    const matchTitle = titleEn ?? entry.title

    // The filter gate, on the translated title and before anything else
    // is paid for. A title every subscriber has filtered never becomes a
    // row at all: no embedding, no fetch.
    const filteredOutFor = feed.subscribers
      .filter((sub) => matchedAutoDeleteKeyword(matchTitle, sub.keywords) !== null)
      .map((sub) => sub.userId)
    if (filteredOutFor.length === feed.subscribers.length) return []

    return [
      {
        ...entry,
        titleEn,
        matchTitle,
        filteredOutFor,
        embedding: null as number[] | null,
        exactMatchId: null as string | null,
      },
    ]
  })

  // Free before paid: an identical link or title answers the duplicate
  // question without the vector lookup in processItem.
  const exact = await findExactMatches(supabase, gated)
  gated.forEach((entry, index) => {
    entry.exactMatchId = exact.get(index) ?? null
  })

  let embedUsage = EMPTY_USAGE
  if (DEDUPE_MODE !== 'off' && gated.length > 0) {
    // Everything is embedded, exact matches included: the embedding is
    // what lets a later item recognize this row, and at $0.02/1M over a
    // ~15-token headline it costs next to nothing.
    const embedded = await embedTexts(gated.map((entry) => entry.matchTitle))
    embedUsage = embedded.usage
    gated.forEach((entry, index) => {
      entry.embedding = embedded.embeddings[index]
    })
  }

  return {
    prepared: gated,
    usage: { translate: translated.usage, summarize: EMPTY_USAGE, embed: embedUsage },
  }
}

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
  deadline: number,
  runCache: RunCache,
  runPace: RunPace
): Promise<FeedResult> {
  // Accumulated outside the try so the catch below can report what a
  // failed feed had already spent before it threw.
  let usage = EMPTY_INGEST_USAGE
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
      // Only articles published in the last 12 hours. An item with no
      // parseable date (and every Build a Feed item, which rarely carries
      // one) is judged by arrival instead: it's accepted the first time
      // it's seen, and the seen-set below keeps it from coming back while
      // it stays on the page.
      .filter((entry) => {
        if (feed.is_scraped) return true
        const publishedMs = entry.item.isoDate ? new Date(entry.item.isoDate).getTime() : NaN
        return Number.isNaN(publishedMs) || publishedMs >= cutoffMs
      })

    // Checked against ingested_guids, not feed_items. feed_items is
    // short-lived (reclaimed 12h after ingest), so an article still listed
    // in its feed would read as new once its row was gone. See the
    // ingested_guids migration.
    const existingGuids = new Set<string>()
    const guids = items.map((entry) => entry.guid)
    for (let i = 0; i < guids.length; i += EXISTING_GUID_CHECK_BATCH_SIZE) {
      const batch = guids.slice(i, i + EXISTING_GUID_CHECK_BATCH_SIZE)
      const { data: existing, error: existingError } = await supabase
        .from('ingested_guids')
        .select('guid')
        .eq('feed_id', feed.id)
        .in('guid', batch)

      if (existingError) {
        throw new Error(`Failed to check existing items: ${existingError.message}`)
      }

      for (const row of existing ?? []) existingGuids.add(row.guid)
    }

    const newItems = items.filter((entry) => !existingGuids.has(entry.guid))

    // Guids still listed in the feed stay remembered: the seen-set forgets
    // a guid 72h after it was last seen, so an undated story that sits on
    // a page for days never comes back as new. Best-effort.
    if (existingGuids.size > 0) {
      const now = new Date().toISOString()
      const { error: seenError } = await supabase.from('ingested_guids').upsert(
        [...existingGuids].map((guid) => ({ feed_id: feed.id, guid, last_seen_at: now })),
        { onConflict: 'feed_id,guid' }
      )
      if (seenError) console.error(`ingest: failed to refresh seen guids for ${feed.id}`, seenError.message)
    }

    // Checked before the batched translate/embed calls rather than only
    // inside the item loop: those are paid for the whole feed up front, so
    // starting them with no budget left would buy translations for items
    // this run won't write. Nothing has been
    // written for these guids, so the next run finds them again.
    let prepared: PreparedItem[] = []
    if (newItems.length > 0 && Date.now() <= deadline) {
      // Prepare only what the remaining budget can plausibly finish. The
      // rest is left untouched — nothing is written for them, so the next
      // run finds exactly these items again, unprepared and unpaid for.
      const capacity = runPace.capacity(deadline - Date.now())
      const affordable = newItems.slice(0, capacity)
      if (affordable.length < newItems.length) {
        console.log(
          `ingest: feed ${feed.id} deferring ${newItems.length - affordable.length} of ` +
            `${newItems.length} new items to the next run (budget)`
        )
      }
      const preparation = await prepareItems(supabase, affordable, feed, targetLanguage)
      prepared = preparation.prepared
      usage = addIngestUsage(usage, preparation.usage)
    }

    // Each item is inserted as soon as it's processed (inside processItem)
    // rather than buffering the whole feed's rows for one bulk insert at
    // the end — a large or first-time feed can have enough new items that
    // a mid-run crash or timeout would otherwise discard every processed
    // item for this feed.
    //
    // The deadline check is per item rather than per feed: once the run
    // budget is spent, remaining items are simply left for the next cron
    // pass, which finds them again because nothing was written for them.
    const results = await mapWithConcurrency(prepared, ITEM_CONCURRENCY, (entry) => {
      if (Date.now() > deadline) return Promise.resolve(SKIPPED)
      // Timed so later feeds size their preparation batch against what
      // items are actually costing this run, not a guess.
      const startedAt = Date.now()
      return processItem(supabase, feed, entry, runCache).finally(() =>
        runPace.record(Date.now() - startedAt)
      )
    })

    const itemsInserted = results.filter((r) => r.inserted).length
    const duplicatesFound = results.filter((r) => r.duplicate).length
    const textsStored = results.filter((r) => r.fullText).length

    const { error: updateError } = await supabase
      .from('feeds')
      .update({ last_fetched_at: new Date().toISOString(), last_error: null, consecutive_failures: 0 })
      .eq('id', feed.id)

    if (updateError) {
      throw new Error(`Failed to update last_fetched_at: ${updateError.message}`)
    }

    return { ok: true, itemsInserted, duplicatesFound, textsStored, usage }
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

    return { ok: false, failure: { feedId: feed.id, url: feed.url, error: message }, usage }
  }
}

// A backstop pass over each user's whole Inbox, not the primary filter:
// prepareItems already drops a matching title before it costs a fetch. This catches the cases that path can't: a keyword
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

// Shared by the cron route and the Sync button, so both apply the same
// cutoff. Parable covers the last 12 hours (see [[context]]): an older
// article would leave the Inbox the moment it arrived, and a feed's first
// fetch would otherwise backfill its whole history.
const MAX_ITEM_AGE_HOURS = 12

// Persists one row per run, so the token counters accumulated above
// outlive the log line they used to end up in. This is what the Usage box
// on /settings reads, and the baseline any later pipeline change is
// measured against.
//
// Best-effort and deliberately last: failing to record what a run did
// should never fail the run itself.
async function recordRun(
  supabase: AdminClient,
  summary: IngestSummary,
  durationMs: number
): Promise<void> {
  const { usage } = summary
  const { error } = await supabase.from('ingest_runs').insert({
    duration_ms: durationMs,
    feeds_processed: summary.feedsProcessed,
    feeds_failed: summary.feedsFailed.length,
    items_inserted: summary.itemsInserted,
    duplicates_found: summary.duplicatesFound,
    texts_stored: summary.textsStored,
    translate_calls: usage.translate.calls,
    translate_input_tokens: usage.translate.inputTokens,
    translate_output_tokens: usage.translate.outputTokens,
    translate_reasoning_tokens: usage.translate.reasoningTokens,
    summarize_calls: usage.summarize.calls,
    summarize_input_tokens: usage.summarize.inputTokens,
    summarize_output_tokens: usage.summarize.outputTokens,
    summarize_reasoning_tokens: usage.summarize.reasoningTokens,
    embed_calls: usage.embed.calls,
    embed_input_tokens: usage.embed.inputTokens,
  })
  if (error) console.error('ingest: failed to record run', error.message)
}

export interface RunIngestOptions {
  // Limit the run to feeds this user subscribes to (the manual Sync
  // button). Every subscriber of those feeds still gets their filters
  // applied. Omitted by cron, which runs every subscribed feed.
  onlyUserId?: string
}

export async function runIngest(options: RunIngestOptions = {}): Promise<IngestSummary> {
  const supabase = adminClient()
  const startedAt = Date.now()
  const cutoffMs = Date.now() - MAX_ITEM_AGE_HOURS * 60 * 60 * 1000
  const deadline = Date.now() + RUN_BUDGET_MS

  // Only feeds someone subscribes to are worth fetching. Each feed also
  // needs its subscribers' filter keywords, so an item nobody wants is
  // dropped before it costs anything (see prepareItems).
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
  const subscribedFeedIds = options.onlyUserId
    ? [...subscribersByFeed.entries()]
        .filter(([, list]) => list.some((sub) => sub.userId === options.onlyUserId))
        .map(([feedId]) => feedId)
    : [...subscribersByFeed.keys()]

  if (subscribedFeedIds.length === 0) {
    // Recorded like any other run. A run that processed nothing is exactly
    // the signal worth having — an empty run looked identical to a working
    // one for thirteen days once the only subscription pointed at a
    // soft-deleted feed.
    const empty: IngestSummary = {
      feedsProcessed: 0,
      feedsFailed: [],
      itemsInserted: 0,
      itemsAutoDeleted: 0,
      duplicatesFound: 0,
      textsStored: 0,
      usage: EMPTY_INGEST_USAGE,
    }
    await recordRun(supabase, empty, Date.now() - startedAt)
    return empty
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

  // One cache for the whole run, shared across every concurrent feed —
  // that sharing is the entire point of it.
  const runCache = new RunCache()
  const runPace = new RunPace()
  const results = await mapWithConcurrency(feeds, FEED_CONCURRENCY, (feed) =>
    processFeed(supabase, feed, cutoffMs, INGEST_TARGET_LANGUAGE, deadline, runCache, runPace)
  )

  let feedsProcessed = 0
  let itemsInserted = 0
  let duplicatesFound = 0
  let textsStored = 0
  let usage = EMPTY_INGEST_USAGE
  const feedsFailed: FeedFailure[] = []

  for (const result of results) {
    // Counted on both arms: a feed that failed partway through can still
    // have paid for a batch translation first.
    usage = addIngestUsage(usage, result.usage)
    if (result.ok) {
      feedsProcessed++
      itemsInserted += result.itemsInserted
      duplicatesFound += result.duplicatesFound
      textsStored += result.textsStored
    } else {
      feedsFailed.push(result.failure)
    }
  }

  const itemsAutoDeleted = await applyAutoDeleteRules(supabase)

  const summary: IngestSummary = {
    feedsProcessed,
    feedsFailed,
    itemsInserted,
    itemsAutoDeleted,
    duplicatesFound,
    textsStored,
    usage,
  }
  await recordRun(supabase, summary, Date.now() - startedAt)
  return summary
}
