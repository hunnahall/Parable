import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'

// This now runs inside the ingest loop, once per new article, against a
// route with a ~300s budget shared across every feed (Fluid Compute is
// confirmed on for this Vercel project — see supabase/cron.sql). A slow
// origin costs the whole run, not one impatient reader, so the timeout is
// tighter than the 20s the reading view could afford: an article whose
// page won't answer in 10s falls back to summarizing the feed's own
// description rather than holding the budget hostage.
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

// Cheap header-image-only fetch — used to populate feed_items.image_url
// for an item whose body extraction already failed (or was skipped), so
// it still gets a real cover image instead of the favicon fallback.
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

// Fetches the source article's HTML and extracts the readable body via
// Readability (the same jsdom-backed approach Firefox's own Reader View
// uses). Returns plain text only: the body exists solely as input to the
// summarizer and is discarded the moment the summary is written, so
// there's nothing left to render and no HTML worth sanitizing. Never
// throws — failures come back as {error} so ingest can fall back to the
// feed's own description.
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
    const text = article?.textContent?.trim() ?? ''
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
