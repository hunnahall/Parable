import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import sanitizeHtml from 'sanitize-html'

// Shorter than the ingest pipeline's fetch-timeout convention (see
// FEED_FETCH_TIMEOUT_MS in src/lib/feeds/ingest.ts, still 15s — that one
// runs in the background, this one blocks a user staring at a reading
// view) — a slow source shouldn't hang the reading view indefinitely.
// Most successful extractions complete in low single-digit seconds, so
// 10s still comfortably covers normal sites without extending the
// worst-case wait as far as 15s did.
const FETCH_TIMEOUT_MS = 10_000

export type ExtractResult = { html: string; text: string } | { error: string }

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
    const article = new Readability(dom.window.document).parse()
    if (!article?.content) {
      return { error: 'Could not extract readable content from this page.' }
    }

    return {
      html: sanitizeContent(article.content),
      text: article.textContent?.trim() ?? '',
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: `Extraction failed: ${message}` }
  } finally {
    clearTimeout(timeout)
  }
}
