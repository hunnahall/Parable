import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import sanitizeHtml from 'sanitize-html'

// This no longer blocks the reading view's initial paint (see
// src/app/api/articles/[id]/content/route.ts — the page renders
// immediately and this fetch happens client-side, after mount), so it
// can afford to be generous rather than trading false "aborted" failures
// for a few saved seconds on an already-off-critical-path request. The
// route itself has ~300s of real budget (Fluid Compute is confirmed on
// for this Vercel project — see supabase/cron.sql), so this is a UX
// choice (how long to make a live user wait on a slow site before giving
// up), not a platform workaround — a genuinely slow origin (e.g. a
// foreign news site that took 20s+ to respond, seen in article_content's
// extraction_error column as "This operation was aborted") should fail
// cleanly here rather than hang the reading view indefinitely.
const FETCH_TIMEOUT_MS = 20_000

export type ExtractResult =
  | { html: string; text: string; imageUrl: string | null }
  | { error: string }

// Readability's output is cleaner than raw publisher HTML but still
// untrusted third-party markup, so it goes through the same sanitize-html
// discipline src/lib/translate.ts::stripHtml applies elsewhere — just with
// a richer allowlist here since this is a full reading view, not a
// title/summary field.
const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'a', 'img', 'blockquote',
  'ul', 'ol', 'li',
  'code', 'pre',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'figure', 'figcaption',
  'strong', 'em', 'b', 'i', 'br', 'hr', 'span',
]

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

// Cheap header-image-only fetch — used to eagerly populate
// feed_items.image_url for a newly ingested item regardless of whether it
// needs translation (see ingest.ts). fetchAndExtractContent below is
// reserved for items already in the target language since it also runs
// Readability and persists the full article body; this skips both, so an
// item needing translation still gets a real cover image without paying
// for (or caching) content that a lazy open-time fetch will redo anyway.
export async function fetchHeaderImage(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ParableBot/1.0)' },
    })
    if (!response.ok) return null

    const html = await response.text()
    const dom = new JSDOM(html, { url })
    return extractHeaderImage(dom.window.document)
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function sanitizeContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt', 'title'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
    },
  })
}

// The lazy-fetch point for the reading view: fetches the source article's
// HTML, extracts the readable content via Readability (the same
// jsdom-backed approach Firefox's own Reader View uses), and sanitizes the
// result. Never throws — failures come back as {error} so the caller can
// cache "extraction failed" and skip re-fetching on every open.
export async function fetchAndExtractContent(url: string): Promise<ExtractResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ParableBot/1.0)' },
    })
    if (!response.ok) {
      return { error: `Fetch failed: HTTP ${response.status}` }
    }
    const html = await response.text()

    const dom = new JSDOM(html, { url })
    // Read the header image before Readability's .parse() below, which
    // mutates/strips the document as it extracts the article body.
    const imageUrl = extractHeaderImage(dom.window.document)
    const article = new Readability(dom.window.document).parse()
    if (!article?.content) {
      return { error: 'Could not extract readable content from this page.' }
    }

    return {
      html: sanitizeContent(article.content),
      text: article.textContent?.trim() ?? '',
      imageUrl,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: `Extraction failed: ${message}` }
  } finally {
    clearTimeout(timeout)
  }
}
