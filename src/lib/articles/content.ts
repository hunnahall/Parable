import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'
import { translateFullContent } from '@/lib/translate'
import { fetchAndExtractContent, fetchHeaderImage } from './extract'

export interface ArticleContent {
  contentHtml: string | null
  contentText: string | null
  contentEnHtml: string | null
  extractionError: string | null
}

// A transient failure (a momentary 503, a network blip) shouldn't
// permanently block an article's content — but a genuinely dead link
// shouldn't get re-fetched on every single open either. Retry a failed
// extraction, bounded by both a max attempt count and a cooldown window.
const MAX_EXTRACTION_ATTEMPTS = 3
const RETRY_COOLDOWN_MS = 6 * 60 * 60 * 1000

// A cache hit (or a genuine miss with no row at all) resolved from the
// select alone; a stale, retry-eligible failure needs fetchAndPersistContent
// below to actually run the scrape.
type CacheCheck =
  | { hit: true; content: ArticleContent }
  | { hit: false; attemptCount: number }

// Split out so a caller that also needs another piece of data keyed only
// on feedItemId (not on the article's link) can fire this select in
// parallel with that other read instead of paying for it as a second
// sequential round trip — see src/app/api/articles/[id]/content/route.ts.
export async function checkArticleContentCache(feedItemId: string): Promise<CacheCheck> {
  const supabase = await createClient()

  const { data: existing, error: selectError } = await supabase
    .from('article_content')
    .select('content_html, content_text, content_en_html, extraction_error, attempt_count, extracted_at')
    .eq('feed_item_id', feedItemId)
    .maybeSingle()
  logQueryError('articles/checkArticleContentCache (select)', selectError)

  if (existing) {
    const attemptsExhausted = existing.attempt_count >= MAX_EXTRACTION_ATTEMPTS
    const withinCooldown = Date.now() - new Date(existing.extracted_at).getTime() < RETRY_COOLDOWN_MS
    const shouldRetry = existing.extraction_error !== null && !attemptsExhausted && !withinCooldown

    if (!shouldRetry) {
      return {
        hit: true,
        content: {
          contentHtml: existing.content_html,
          contentText: existing.content_text,
          contentEnHtml: existing.content_en_html,
          extractionError: existing.extraction_error,
        },
      }
    }
  }

  return { hit: false, attemptCount: (existing?.attempt_count ?? 0) + 1 }
}

// The actual scrape+persist step, split out so a caller that already has a
// CacheCheck (e.g. one obtained in parallel with other reads) can skip
// straight to it on a miss instead of re-running the select.
//
// `supabaseClient` defaults to the request-scoped cookie client for the
// normal lazy-open path (see the content route); runIngest's prewarm path
// below passes its own admin client instead, since it runs with no user
// session.
export async function fetchAndPersistArticleContent(
  feedItemId: string,
  link: string | null,
  attemptCount: number,
  supabaseClient?: SupabaseClient
): Promise<ArticleContent> {
  const supabase = supabaseClient ?? (await createClient())

  if (!link) {
    const row = { contentHtml: null, contentText: null, contentEnHtml: null, extractionError: 'No source URL for this article.' }
    const { error } = await supabase.from('article_content').upsert({
      feed_item_id: feedItemId,
      extraction_error: row.extractionError,
      attempt_count: attemptCount,
      extracted_at: new Date().toISOString(),
    })
    logQueryError('articles/fetchAndPersistArticleContent (upsert, no link)', error)
    return row
  }

  const result = await fetchAndExtractContent(link)

  if ('error' in result) {
    const { error } = await supabase.from('article_content').upsert({
      feed_item_id: feedItemId,
      extraction_error: result.error,
      attempt_count: attemptCount,
      extracted_at: new Date().toISOString(),
    })
    logQueryError('articles/fetchAndPersistArticleContent (upsert, error)', error)
    return { contentHtml: null, contentText: null, contentEnHtml: null, extractionError: result.error }
  }

  const { error } = await supabase.from('article_content').upsert({
    feed_item_id: feedItemId,
    content_html: result.html,
    content_text: result.text,
    extraction_error: null,
    attempt_count: attemptCount,
    extracted_at: new Date().toISOString(),
  })
  logQueryError('articles/fetchAndPersistArticleContent (upsert, success)', error)

  // The scraped page's own og:image/twitter:image is the article's real
  // header image — more reliable than whatever the RSS feed's enclosure/
  // media tags provided (often just the feed's logo repeated on every
  // item, see ingest.ts). Overwrite feed_items.image_url with it so Card
  // view picks up the correct image the next time this article's row is
  // rendered. Best-effort: this is a nice-to-have, not worth failing the
  // request over.
  if (result.imageUrl) {
    const { error: imageError } = await supabase
      .from('feed_items')
      .update({ image_url: result.imageUrl })
      .eq('id', feedItemId)
    logQueryError('articles/fetchAndPersistArticleContent (image_url update)', imageError)
  }

  return { contentHtml: result.html, contentText: result.text, contentEnHtml: null, extractionError: null }
}

// Eagerly scrapes+caches a brand-new article's content right after ingest
// — called from runIngest (src/lib/feeds/ingest.ts) only for items whose
// detected language already matches the target (or couldn't be detected),
// since that guarantees translate-on-open will never fire for this item
// and this can't waste an OpenAI call. Always a genuine cache miss (the
// item was just inserted this run), so this skips straight to the fetch
// instead of paying for a cache-check select first. Never throws — a
// failed prewarm just leaves the item to the normal lazy-fetch path on its
// first open.
export async function prewarmArticleContent(
  supabase: SupabaseClient,
  feedItemId: string,
  link: string
): Promise<void> {
  try {
    await fetchAndPersistArticleContent(feedItemId, link, 1, supabase)
  } catch (err) {
    console.error(`articles/prewarmArticleContent: feed_item ${feedItemId}`, err)
  }
}

// The image-only counterpart to prewarmArticleContent above — called from
// runIngest for brand-new items that need translation (which skip the full
// content prewarm to avoid pre-caching content translate-on-open would
// otherwise redo) so they still get a real cover image instead of sitting
// on the favicon fallback until someone happens to open them. Never
// throws — best-effort, same as prewarmArticleContent.
export async function prewarmArticleImage(
  supabase: SupabaseClient,
  feedItemId: string,
  link: string
): Promise<void> {
  try {
    const imageUrl = await fetchHeaderImage(link)
    if (!imageUrl) return

    const { error } = await supabase.from('feed_items').update({ image_url: imageUrl }).eq('id', feedItemId)
    logQueryError('articles/prewarmArticleImage', error)
  } catch (err) {
    console.error(`articles/prewarmArticleImage: feed_item ${feedItemId}`, err)
  }
}

// Persists a translated version once translate-on-open (see
// src/lib/translate.ts::translateFullContent) succeeds — called from the
// reading-view page after getOrFetchArticleContent returns a cache miss
// whose original_language isn't English.
export async function saveTranslatedContent(feedItemId: string, contentEnHtml: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('article_content')
    .update({ content_en_html: contentEnHtml })
    .eq('feed_item_id', feedItemId)
  logQueryError('articles/saveTranslatedContent', error)
}

// The translate-on-open chain, shared by two callers: the content route
// (lazy, on the reading view's first open) and moveToReader's background
// job (eager, right after an article is moved to Reader — see
// src/lib/articles/actions.ts). Returns the translated HTML (or the
// content's own already-cached translation, or null if none was needed/
// possible) — never throws, since a failed translation just leaves the
// original-language content in place.
export async function ensureArticleContentTranslated(
  feedItemId: string,
  content: ArticleContent,
  originalLanguage: string | null,
  targetLanguage: string
): Promise<string | null> {
  if (content.contentEnHtml) return content.contentEnHtml
  if (!content.contentText) return null
  if (!originalLanguage || originalLanguage === targetLanguage || originalLanguage === 'und') {
    return null
  }

  const translated = await translateFullContent(content.contentText, targetLanguage)
  if (!translated) return null

  await saveTranslatedContent(feedItemId, translated)
  return translated
}
