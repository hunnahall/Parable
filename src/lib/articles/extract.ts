import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'

// Runs inside the ingest loop, once per new article, against a route with
// a ~300s budget shared across every feed. A page that won't answer in 10s
// falls back to the feed's own description.
const FETCH_TIMEOUT_MS = 10_000

// The image is carried on the failure arm too. A page that fetched and
// parsed but yielded no usable body still has its og:image sitting in the
// DOM we just built — returning it means ingest never has to re-fetch the
// same URL a second time just to read one meta tag.
export type ExtractResult =
  | { text: string; imageUrl: string | null }
  | { error: string; imageUrl: string | null }

// The RSS-provided image (enclosure/media:content/media:thumbnail — see
// ingest.ts) is often just the feed's own logo/icon repeated on every
// item, not the article's own header image. og:image/twitter:image are
// what publishers actually set to represent a specific article, and the
// page is already being parsed here anyway — nearly free to also read.
function extractHeaderImage(document: Document): string | null {
  const og = document.querySelector('meta[property="og:image"]')?.getAttribute('content')
  const twitter = document.querySelector('meta[name="twitter:image"]')?.getAttribute('content')
  return og || twitter || null
}

// Fetches the article's HTML and extracts the readable body with
// Readability (the jsdom-backed approach Firefox's Reader View uses).
// Returns plain text with paragraphs separated by a blank line, which is
// what feed_item_texts stores and the reader view renders. Never throws:
// failures come back as {error} so ingest can fall back to the feed's own
// description.
export async function fetchAndExtractContent(url: string): Promise<ExtractResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ParableBot/1.0)' },
    })
    if (!response.ok) {
      return { error: `Fetch failed: HTTP ${response.status}`, imageUrl: null }
    }
    const html = await response.text()

    const dom = new JSDOM(html, { url })
    // Read the header image before Readability's .parse() below, which
    // mutates/strips the document as it extracts the article body.
    const imageUrl = extractHeaderImage(dom.window.document)
    const article = new Readability(dom.window.document).parse()
    const text = article?.content ? paragraphsOf(article.content, url) : ''
    if (!text) {
      return { error: 'Could not extract readable content from this page.', imageUrl }
    }

    return { text, imageUrl }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: `Extraction failed: ${message}`, imageUrl: null }
  } finally {
    clearTimeout(timeout)
  }
}

// Block-level elements that carry the article's own paragraphs. Headings
// and list items are kept so structure survives as separate paragraphs.
const BLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, figcaption'

// Lines that point elsewhere instead of belonging to the article: "read
// also" links in French, Arabic and English. Matched at the start of a
// paragraph, so a sentence that merely contains "voir aussi" stays.
const READ_ALSO =
  /^\s*(?:[»>•▶►|-]\s*)?(?:(?:à |a )?lire (?:aussi|également|egalement)|(?:à |a )?voir aussi|(?:à |a )?(?:écouter|ecouter|regarder) aussi|sur le même sujet|read (?:also|more)|also read|see also|related(?: articles?| stories)?|more on this(?: story)?|(?:اقرأ|إقرأ|اقرا) (?:أيضا|أيضاً|ايضا|المزيد)|(?:طالع|شاهد) (?:أيضا|أيضاً|ايضا)|مواضيع ذات صلة)\s*[:：-]?/iu

// Short lines that are ad or page furniture, not article text. Only whole
// short paragraphs are dropped, never a sentence inside a real one.
const FURNITURE =
  /^(?:publicité|advertisement|advertising|sponsored(?: content)?|contenu sponsorisé|إعلان|partager(?: cet article)?|share(?: this article)?|abonnez-vous.*|subscribe.*newsletter.*|inscrivez-vous.*newsletter.*|newsletter.*|اشترك.*)$/iu
const FURNITURE_MAX_LENGTH = 120

// A block mostly made of link text is a list of other articles. Short
// blocks only: a long paragraph that links a few phrases is still prose.
// A sentence that ends like one ("..., which he has denied.") is kept
// unless the link covers nearly all of it, since publishers such as the
// Guardian link most of a sentence inside the article.
const LINK_DENSITY_MAX = 0.6
const LINK_DENSITY_SENTENCE_MAX = 0.95
const SENTENCE_END = /[.!?…؟。]["'»”’)]*$/u
const LINK_BLOCK_MAX_LENGTH = 300

function collapse(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim()
}

function linkDensity(el: Element, textLength: number): number {
  if (textLength === 0) return 0
  const linked = Array.from(el.querySelectorAll('a')).reduce((sum, a) => sum + collapse(a.textContent).length, 0)
  return linked / textLength
}

// Lists whose items are mostly links (related-article lists, tag clouds)
// go before paragraphs are read, so their items aren't kept one by one.
function removeLinkLists(document: Document): void {
  for (const list of Array.from(document.querySelectorAll('ul, ol'))) {
    const items = Array.from(list.querySelectorAll(':scope > li'))
    if (items.length === 0) continue
    const linky = items.filter((li) => {
      const length = collapse(li.textContent).length
      return length > 0 && linkDensity(li, length) > LINK_DENSITY_MAX
    })
    if (linky.length / items.length >= 0.5) list.remove()
  }
}

// Whether a block is the article's own text. Exported for the extraction
// test script.
export function isArticleText(el: Element): boolean {
  const text = collapse(el.textContent)
  if (!text) return false
  if (READ_ALSO.test(text)) return false
  if (text.length <= FURNITURE_MAX_LENGTH && FURNITURE.test(text)) return false
  if (text.length <= LINK_BLOCK_MAX_LENGTH) {
    const density = linkDensity(el, text.length)
    const limit = SENTENCE_END.test(text) ? LINK_DENSITY_SENTENCE_MAX : LINK_DENSITY_MAX
    if (density > limit) return false
  }
  return true
}

// Readability's cleaned HTML, as paragraphs of collapsed text, with "read
// also" lines, link lists and ad furniture removed (roadmap step 10). Only
// leaf blocks are read (a block with a block inside it would repeat its
// child's text), and loose text Readability left outside any block falls
// back to the whole body.
export function paragraphsOf(html: string, url: string): string {
  const document = new JSDOM(html, { url }).window.document
  removeLinkLists(document)
  const blocks = Array.from(document.querySelectorAll(BLOCK_SELECTOR)).filter(
    (el) => !el.querySelector(BLOCK_SELECTOR)
  )
  if (blocks.length > 0) {
    return blocks
      .filter(isArticleText)
      .map((el) => collapse(el.textContent))
      .join('\n\n')
  }
  return collapse(document.body.textContent)
}
