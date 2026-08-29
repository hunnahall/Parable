import { NextResponse } from 'next/server'
import { createClient, getUser } from '@/lib/supabase/server'
import { getOrFetchArticleContent, saveTranslatedContent } from '@/lib/articles/content'
import { translateFullContent } from '@/lib/translate'
import { getUserPreferences } from '@/lib/preferences/data'

// jsdom (via the content extractor) needs real Node APIs.
export const runtime = 'nodejs'
// A cache-miss scrape (up to 20s, see extract.ts) followed by a
// translation call (up to 15s, see translate.ts) can take longer than a
// typical serverless default — this route is called client-side, off the
// initial page-load critical path, specifically so it can afford to.
export const maxDuration = 60

// The reading view's slow part, split out of the page's initial render
// (see src/app/articles/[id]/page.tsx and ArticleReadingView.tsx) so
// opening an article shows the title/metadata/buttons immediately instead
// of blocking on a live scrape+translate chain — this is fetched
// client-side right after the shell mounts.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { id } = await params
  const supabase = await createClient()
  const { data: item, error } = await supabase
    .from('feed_items')
    .select('link, original_language')
    .eq('id', id)
    .maybeSingle()

  if (error || !item) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 })
  }

  const [content, prefs] = await Promise.all([
    getOrFetchArticleContent(id, item.link),
    getUserPreferences(),
  ])

  // Translate-on-open: only for articles not already in the user's target
  // language, only once (cached in content_en_html thereafter), and only
  // when extraction actually succeeded.
  let contentEnHtml = content.contentEnHtml
  if (
    !contentEnHtml &&
    content.contentText &&
    item.original_language &&
    item.original_language !== prefs.language &&
    item.original_language !== 'und'
  ) {
    const translated = await translateFullContent(content.contentText, prefs.language)
    if (translated) {
      await saveTranslatedContent(id, translated)
      contentEnHtml = translated
    }
  }

  return NextResponse.json({
    contentHtml: contentEnHtml ?? content.contentHtml,
    extractionError: content.extractionError,
    isTranslated: !!contentEnHtml,
  })
}
