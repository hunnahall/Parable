import { createClient } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'
import { fetchAndExtractContent } from './extract'

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

// The lazy-fetch trigger point: reads the cache, and on a genuine miss (no
// row at all) — or a stale, retry-eligible failure — fetches+extracts+
// persists. A successful row (extraction_error null) is always cached, no
// retry.
export async function getOrFetchArticleContent(
  feedItemId: string,
  link: string | null
): Promise<ArticleContent> {
  const supabase = await createClient()

  const { data: existing, error: selectError } = await supabase
    .from('article_content')
    .select('content_html, content_text, content_en_html, extraction_error, attempt_count, extracted_at')
    .eq('feed_item_id', feedItemId)
    .maybeSingle()
  logQueryError('articles/getOrFetchArticleContent (select)', selectError)

  if (existing) {
    const attemptsExhausted = existing.attempt_count >= MAX_EXTRACTION_ATTEMPTS
    const withinCooldown = Date.now() - new Date(existing.extracted_at).getTime() < RETRY_COOLDOWN_MS
    const shouldRetry = existing.extraction_error !== null && !attemptsExhausted && !withinCooldown

    if (!shouldRetry) {
      return {
        contentHtml: existing.content_html,
        contentText: existing.content_text,
        contentEnHtml: existing.content_en_html,
        extractionError: existing.extraction_error,
      }
    }
  }

  const attemptCount = (existing?.attempt_count ?? 0) + 1

  if (!link) {
    const row = { contentHtml: null, contentText: null, contentEnHtml: null, extractionError: 'No source URL for this article.' }
    const { error } = await supabase.from('article_content').upsert({
      feed_item_id: feedItemId,
      extraction_error: row.extractionError,
      attempt_count: attemptCount,
      extracted_at: new Date().toISOString(),
    })
    logQueryError('articles/getOrFetchArticleContent (upsert, no link)', error)
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
    logQueryError('articles/getOrFetchArticleContent (upsert, error)', error)
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
  logQueryError('articles/getOrFetchArticleContent (upsert, success)', error)

  return { contentHtml: result.html, contentText: result.text, contentEnHtml: null, extractionError: null }
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
