import { NextResponse } from 'next/server'
import { createClient, getUser } from '@/lib/supabase/server'
import {
  checkArticleContentCache,
  fetchAndPersistArticleContent,
  saveTranslatedContent,
  type ArticleContent,
} from '@/lib/articles/content'
import { translateFullContent } from '@/lib/translate'
import { getUserPreferences } from '@/lib/preferences/data'

// jsdom (via the content extractor) needs real Node APIs.
export const runtime = 'nodejs'
// A cache-miss scrape (up to 20s, see extract.ts) followed by a
// translation call (up to 15s, see translate.ts) can take longer than a
// typical serverless default — this route is called client-side, off the
// initial page-load critical path, so it can afford to. Fluid Compute is
// confirmed on for this Vercel project (Settings → Functions), which
// gives Hobby-plan functions up to 300s, well clear of this budget — see
// supabase/cron.sql for how that was verified.
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

  // Guards the whole scrape+translate chain below so an unexpected
  // exception (a bad response from a flaky origin, an OpenAI client
  // throwing outside its own try/catch, etc.) still comes back as a JSON
  // error the client can display, instead of a platform error page that
  // isn't valid JSON — the client's res.json() call would throw on that,
  // which is what surfaced as the generic, undiagnosable "Failed to load
  // article content." (see contentCache.ts's fetchContent).
  try {
    const supabase = await createClient()
    // Three independent reads fired together instead of paying for three
    // sequential round trips: the cache check only needs `id` (not the
    // article's link, which the article_content lookup never uses), and
    // prefs needs neither.
    const [{ data: item, error }, cacheCheck, prefs] = await Promise.all([
      supabase
        .from('feed_items')
        .select('link, original_language, translate_enabled')
        .eq('id', id)
        .maybeSingle(),
      checkArticleContentCache(id),
      getUserPreferences(),
    ])

    if (error || !item) {
      return NextResponse.json({ error: 'Article not found' }, { status: 404 })
    }

    const content: ArticleContent = cacheCheck.hit
      ? cacheCheck.content
      : await fetchAndPersistArticleContent(id, item.link, cacheCheck.attemptCount)

    // Translate-on-open: only for articles not already in the user's target
    // language, only once (cached in content_en_html thereafter), only when
    // extraction actually succeeded, and only when this item's feed hasn't
    // opted out of translation entirely (translate_enabled, copied onto the
    // row at ingest time — see runIngest in src/lib/feeds/ingest.ts).
    let contentEnHtml = content.contentEnHtml
    if (
      item.translate_enabled &&
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`articles/[id]/content: unhandled error for ${id}:`, message)
    return NextResponse.json({ error: 'Failed to load article content.' }, { status: 500 })
  }
}
