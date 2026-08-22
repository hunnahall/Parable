import { createClient } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'
import { fetchAndExtractContent } from './extract'

export interface ArticleContent {
  contentHtml: string | null
  contentText: string | null
  contentEnHtml: string | null
  extractionError: string | null
}

// The lazy-fetch trigger point: reads the cache, and on a genuine miss (no
// row at all) fetches+extracts+persists. A row that exists but only has
// extraction_error set (a prior failed attempt) is treated as cached too —
// we don't retry a broken source on every single open, matching
// article_content's extracted_at/extraction_error design in the plan.
export async function getOrFetchArticleContent(
  feedItemId: string,
  link: string | null
): Promise<ArticleContent> {
  const supabase = await createClient()

  const { data: existing, error: selectError } = await supabase
    .from('article_content')
    .select('content_html, content_text, content_en_html, extraction_error')
    .eq('feed_item_id', feedItemId)
    .maybeSingle()
  logQueryError('articles/getOrFetchArticleContent (select)', selectError)

  if (existing) {
    return {
      contentHtml: existing.content_html,
      contentText: existing.content_text,
      contentEnHtml: existing.content_en_html,
      extractionError: existing.extraction_error,
    }
  }

  if (!link) {
    const row = { contentHtml: null, contentText: null, contentEnHtml: null, extractionError: 'No source URL for this article.' }
    const { error } = await supabase
      .from('article_content')
      .upsert({ feed_item_id: feedItemId, extraction_error: row.extractionError })
    logQueryError('articles/getOrFetchArticleContent (upsert, no link)', error)
    return row
  }

  const result = await fetchAndExtractContent(link)

  if ('error' in result) {
    const { error } = await supabase
      .from('article_content')
      .upsert({ feed_item_id: feedItemId, extraction_error: result.error })
    logQueryError('articles/getOrFetchArticleContent (upsert, error)', error)
    return { contentHtml: null, contentText: null, contentEnHtml: null, extractionError: result.error }
  }

  const { error } = await supabase.from('article_content').upsert({
    feed_item_id: feedItemId,
    content_html: result.html,
    content_text: result.text,
    extraction_error: null,
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
