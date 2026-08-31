import { NextResponse } from 'next/server'
import { createClient, getUser } from '@/lib/supabase/server'
import { checkArticleContentCache, fetchAndPersistArticleContent } from '@/lib/articles/content'
import { summarizeArticleContent } from '@/lib/summarize'
import { getUserPreferences } from '@/lib/preferences/data'

// jsdom (via the content extractor, on a cache miss) needs real Node APIs.
export const runtime = 'nodejs'
// Worst case pays for a live scrape (up to 20s) plus the OpenAI call —
// same budget as the sibling content route this reuses.
export const maxDuration = 60

// User-triggered only (the "Summarize this" button in ArticleReadingView) —
// never called from ingest or any list view, so it's the one place an
// on-demand OpenAI summary of the FULL article body is worth its cost.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { id } = await params

  // Same rationale as the sibling content route: guarantee a JSON response
  // even if something in this chain throws unexpectedly, so the dialog
  // that calls this (ArticleSummaryDialog) always has an actual message to
  // show instead of a raw fetch/parse failure.
  try {
    const supabase = await createClient()
    const [{ data: item, error }, cacheCheck, prefs] = await Promise.all([
      supabase
        .from('feed_items')
        .select('title, title_en, summary, summary_en, link')
        .eq('id', id)
        .maybeSingle(),
      checkArticleContentCache(id),
      getUserPreferences(),
    ])

    if (error || !item) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 })
    }

    const content = cacheCheck.hit
      ? cacheCheck.content
      : await fetchAndPersistArticleContent(id, item.link, cacheCheck.attemptCount)

    // Full extracted body when available; the feed's own (short) summary as a
    // fallback for articles whose content extraction failed.
    const bodyText = content.contentText ?? item.summary_en ?? item.summary
    if (!bodyText) {
      return NextResponse.json({ error: 'No article text available to summarize.' }, { status: 422 })
    }

    const title = item.title_en ?? item.title
    const summary = await summarizeArticleContent(title, bodyText, prefs.language)
    if (!summary) {
      return NextResponse.json({ error: 'Summary generation failed.' }, { status: 502 })
    }

    return NextResponse.json({ summary })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`articles/[id]/summarize: unhandled error for ${id}:`, message)
    return NextResponse.json({ error: 'Failed to generate summary.' }, { status: 500 })
  }
}
