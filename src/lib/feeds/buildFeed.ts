import { JSDOM } from 'jsdom'

// Powers "Build a Feed" (see BuildFeedSection.tsx): given a URL with no
// RSS/Atom feed of its own, heuristically detect its repeating
// article-list pattern (headline + link + snippet/image) so it can be
// tracked like any other feed. Re-run fresh on every ingest (see
// src/lib/feeds/ingest.ts's is_scraped branch) rather than caching a
// selector, so it keeps working if the site's markup shifts slightly, at
// the cost of a bit more work per poll — feed sizes here are small enough
// that this is a non-issue.
//
// No JS execution (JSDOM's default — same as src/lib/articles/extract.ts):
// this only inspects server-rendered HTML, so a fully client-rendered
// listing (nothing in the initial HTML response) won't be detectable.
//
// Detection strategy: real sites mark up repeated items with a shared CSS
// class (a WordPress theme's `.post-card`, a component's `.loop-card`,
// etc.) far more reliably than any fixed DOM-shape assumption would catch.
// For every candidate headline anchor, climb its ancestor chain a few
// levels and register that anchor against every class name (and a small
// set of semantic tags, for markup that skips classes entirely) seen along
// the way. The class/tag whose registered elements come closest to "one
// distinct article link per element, in good quantity" wins, and its
// elements become the "cards" snippets/images/dates get extracted from.

const FETCH_TIMEOUT_MS = 15_000
const USER_AGENT = 'Mozilla/5.0 (compatible; ParableBot/1.0)'

// Node's fetch() wraps every network-level failure (DNS, TLS, connection
// timeout/refused, ...) in a TypeError whose own message is just the
// literal string "fetch failed" — the actually useful detail lives one
// level down in `cause`. Surfacing only the outer message is why every
// distinct failure showed up identically as "Fetch failed: fetch failed"
// with nothing to tell them apart.
function fetchErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as { cause?: unknown }).cause
    if (cause instanceof Error && cause.message) return cause.message
    return err.message
  }
  return String(err)
}

// A winning group needs at least this many cards before it's trusted as a
// real article list rather than a coincidence.
const MIN_CARD_COUNT = 3
// Raised from 40: the page's HTML is already fully fetched/parsed
// regardless of how many cards get extracted, so this costs no extra
// network work, only a bit more parse/insert work per poll — worth it to
// stop silently dropping items past the old cap on busier sites. Still a
// hard ceiling, not real pagination: a site whose list is genuinely
// paginated (a "next page" link, not just a long single page) needs a
// crawler this scraper isn't, and won't be caught by raising this number.
const MAX_ARTICLES = 100
// Headline candidates shorter than this are almost always nav/UI chrome
// ("Home", "Login", "→"); longer than this are almost never a headline.
const MIN_TITLE_LENGTH = 12
const MAX_TITLE_LENGTH = 220
const MAX_SNIPPET_LENGTH = 400
const MIN_SNIPPET_LENGTH = 20
// A group whose cards mostly point at the same href isn't a real article
// list (e.g. several unrelated cards all wrapping one shared "Subscribe"
// link) — require most links to be distinct.
const MIN_UNIQUE_LINK_RATIO = 0.7
// How many ancestor levels above a candidate headline anchor to search for
// a repeating class/tag. Deep enough to reach a card's outer wrapper on
// most sites, shallow enough to stay well clear of page-level containers.
const MAX_CLIMB_LEVELS = 6
// Semantic tags worth grouping by on their own, for markup that marks up
// repeated items without a distinguishing class at all. Deliberately not
// div/section/span — those are so common that grouping by bare tag name
// would just match coincidental structure, not an actual list.
const SEMANTIC_TAG_FALLBACKS = new Set(['article', 'li', 'tr'])

export interface DetectedArticle {
  title: string
  link: string
  snippet: string | null
  imageUrl: string | null
  publishedAt: string | null
}

export interface BuildFeedPreview {
  sourceUrl: string
  pageTitle: string | null
  articles: DetectedArticle[]
}

export type BuildFeedResult =
  | { preview: BuildFeedPreview; error: null }
  | { preview: null; error: string }

const NO_PATTERN_ERROR = "Couldn't find a repeating article list on this page."
const SKIP_ANCESTOR_SELECTOR = 'nav, header, footer, aside, script, style, noscript'
const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6'
// WordPress and similar CMSes commonly link author/tag/category archive
// pages right alongside the real headline in a card — those pass the
// generic "headline-like anchor" text-length check too, so they'd
// otherwise get registered as competing (and usually losing, but
// noise-adding) candidates for the same card.
const NOISE_HREF_PATH = /\/(author|authors|tag|tags|category|categories|topic|topics|contributor|contributors)\//i

function visibleText(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function isNoiseAnchor(a: HTMLAnchorElement): boolean {
  try {
    return NOISE_HREF_PATH.test(new URL(a.href).pathname)
  } catch {
    return false
  }
}

function looksLikeHeadlineAnchor(a: HTMLAnchorElement): boolean {
  if (!a.href || !/^https?:/.test(a.href)) return false
  if (a.closest(SKIP_ANCESTOR_SELECTOR)) return false
  if (isNoiseAnchor(a)) return false
  if (a.querySelector(HEADING_SELECTOR)) return true
  const text = visibleText(a)
  return text.length >= MIN_TITLE_LENGTH && text.length <= MAX_TITLE_LENGTH
}

// When two different anchors both climb to registering against the same
// (group key, ancestor element) pair — a title link and some other
// headline-like link sharing a card that isn't already filtered out by
// isNoiseAnchor — prefer whichever one actually looks like the real title:
// wrapping a heading beats not, and otherwise longer text beats shorter
// (real headlines run longer than incidental metadata links).
function isBetterAnchor(candidate: HTMLAnchorElement, existing: HTMLAnchorElement): boolean {
  const candidateHeading = candidate.querySelector(HEADING_SELECTOR) !== null
  const existingHeading = existing.querySelector(HEADING_SELECTOR) !== null
  if (candidateHeading !== existingHeading) return candidateHeading
  return visibleText(candidate).length > visibleText(existing).length
}

function extractTitle(card: Element, anchor: HTMLAnchorElement): string {
  const heading = card.querySelector(HEADING_SELECTOR)
  const text = (heading ? visibleText(heading) : '') || visibleText(anchor)
  return text.slice(0, MAX_TITLE_LENGTH)
}

function extractSnippet(card: Element, titleText: string): string | null {
  for (const p of Array.from(card.querySelectorAll('p'))) {
    const text = visibleText(p)
    if (text.length >= MIN_SNIPPET_LENGTH && text !== titleText) {
      return text.slice(0, MAX_SNIPPET_LENGTH)
    }
  }
  return null
}

function extractImage(card: Element): string | null {
  const img = card.querySelector('img[src]')
  return (img as HTMLImageElement | null)?.src || null
}

function extractPublishedAt(card: Element): string | null {
  const time = card.querySelector('time[datetime]')
  const raw = time?.getAttribute('datetime')
  if (!raw) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

interface CandidateGroup {
  cards: Map<Element, HTMLAnchorElement>
}

function buildCandidateGroups(anchors: HTMLAnchorElement[]): Map<string, CandidateGroup> {
  const groups = new Map<string, CandidateGroup>()

  function register(key: string, el: Element, anchor: HTMLAnchorElement) {
    let group = groups.get(key)
    if (!group) {
      group = { cards: new Map() }
      groups.set(key, group)
    }
    const existing = group.cards.get(el)
    if (!existing || isBetterAnchor(anchor, existing)) {
      group.cards.set(el, anchor)
    }
  }

  for (const anchor of anchors) {
    if (!looksLikeHeadlineAnchor(anchor)) continue
    // No need to re-check SKIP_ANCESTOR_SELECTOR while climbing: it's an
    // ancestor test, and looksLikeHeadlineAnchor() already confirmed none
    // of `anchor`'s ancestors match it — every node climbed to below is
    // one of those same already-cleared ancestors.
    let node: Element = anchor
    for (let level = 0; level < MAX_CLIMB_LEVELS; level++) {
      const parent = node.parentElement
      if (!parent) break
      node = parent

      for (const cls of Array.from(node.classList)) {
        register(`class:${cls}`, node, anchor)
      }
      const tag = node.tagName.toLowerCase()
      if (SEMANTIC_TAG_FALLBACKS.has(tag)) {
        register(`tag:${tag}`, node, anchor)
      }
    }
  }

  return groups
}

// Rough proxy for "how much content does this card hold" (element count in
// its subtree) — used only to break ties between two candidate groups that
// matched the exact same set of articles, which happens when one group's
// key is an outer wrapper of another's (e.g. a card div nested one level
// inside a <li>). The outer one is preferred: more room for a snippet/
// image extractArticle can actually find.
function averageSubtreeSize(cards: Element[]): number {
  const total = cards.reduce((sum, el) => sum + el.getElementsByTagName('*').length, 0)
  return total / cards.length
}

// Two passes rather than one: a `class:*` group reflects a deliberate
// "this markup repeats" signal from whoever built the page. A `tag:*`
// fallback group is much weaker — bare <tr>/<li>/<article> elements that
// happen to each contain a headline-length link, which can include things
// that aren't article rows at all (Hacker News's classless subtext rows,
// with their "N hours ago" permalink, are exactly this trap: long enough
// to pass as a headline, numerous enough to occasionally outscore the
// real `class:athing` title-row group on raw count alone). So: always
// prefer the best qualifying class-based group, and only fall back to
// tag-based groups when no class-based group qualifies at all.
function pickWinningGroup(groups: Map<string, CandidateGroup>): Map<Element, HTMLAnchorElement> | null {
  function bestQualifying(prefix: string) {
    let winner: { cards: Map<Element, HTMLAnchorElement>; count: number; avgSize: number } | null = null

    for (const [key, group] of groups) {
      if (!key.startsWith(prefix)) continue
      const cards = Array.from(group.cards.keys())
      if (cards.length < MIN_CARD_COUNT) continue

      const links = cards.map((c) => group.cards.get(c)!.href)
      if (new Set(links).size < cards.length * MIN_UNIQUE_LINK_RATIO) continue

      const avgSize = averageSubtreeSize(cards)
      if (
        !winner ||
        cards.length > winner.count ||
        (cards.length === winner.count && avgSize > winner.avgSize)
      ) {
        winner = { cards: group.cards, count: cards.length, avgSize }
      }
    }

    return winner
  }

  return (bestQualifying('class:') ?? bestQualifying('tag:'))?.cards ?? null
}

export async function detectArticles(sourceUrl: string): Promise<BuildFeedResult> {
  let normalizedUrl: string
  try {
    normalizedUrl = new URL(sourceUrl).toString()
  } catch {
    return { preview: null, error: 'Not a valid URL.' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  let html: string
  try {
    const response = await fetch(normalizedUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    })
    if (!response.ok) {
      return { preview: null, error: `Fetch failed: HTTP ${response.status}` }
    }
    html = await response.text()
  } catch (err) {
    return { preview: null, error: `Fetch failed: ${fetchErrorMessage(err)}` }
  } finally {
    clearTimeout(timeout)
  }

  let document: Document
  try {
    document = new JSDOM(html, { url: normalizedUrl }).window.document
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { preview: null, error: `Couldn't parse this page: ${message}` }
  }

  const anchors = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[]
  const groups = buildCandidateGroups(anchors)
  const winningCards = pickWinningGroup(groups)

  if (!winningCards) {
    return { preview: null, error: NO_PATTERN_ERROR }
  }

  const seenLinks = new Set<string>()
  const articles: DetectedArticle[] = []
  for (const [card, anchor] of winningCards) {
    const link = anchor.href
    if (seenLinks.has(link)) continue
    seenLinks.add(link)

    const title = extractTitle(card, anchor)
    if (!title) continue

    articles.push({
      title,
      link,
      snippet: extractSnippet(card, title),
      imageUrl: extractImage(card),
      publishedAt: extractPublishedAt(card),
    })
    if (articles.length >= MAX_ARTICLES) break
  }

  if (articles.length === 0) {
    return { preview: null, error: NO_PATTERN_ERROR }
  }

  const pageTitle =
    document.querySelector('meta[property="og:site_name"]')?.getAttribute('content')?.trim() ||
    document.title?.trim() ||
    null

  return { preview: { sourceUrl: normalizedUrl, pageTitle, articles }, error: null }
}
