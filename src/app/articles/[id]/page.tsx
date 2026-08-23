import { redirect, notFound } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getArticleById } from '@/lib/dashboard/data'
import { getOrFetchArticleContent, saveTranslatedContent } from '@/lib/articles/content'
import { translateFullContent } from '@/lib/translate'
import { listFolderOptions } from '@/lib/folders/data'
import { getUserPreferences } from '@/lib/preferences/data'
import ArticleReadingView from '@/components/articles/ArticleReadingView'

// jsdom (used by the content extractor) needs real Node APIs, not the edge
// runtime.
export const runtime = 'nodejs'

export default async function ArticleReadingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getUser()
  if (!user) redirect('/login')

  const { id } = await params
  // Independent of article/content below — kicked off now instead of
  // after that chain resolves, so it overlaps instead of adding its own
  // sequential round trip.
  const foldersPromise = listFolderOptions()
  const prefsPromise = getUserPreferences()

  const article = await getArticleById(id)
  if (!article) notFound()

  const content = await getOrFetchArticleContent(id, article.link)
  const prefs = await prefsPromise

  // Translate-on-open: only for articles not already in the user's target
  // language, only once (cached in content_en_html thereafter), and only
  // when extraction actually succeeded — separate from translateArticle's
  // ingest-time title/summary translation, which this never touches.
  let contentEnHtml = content.contentEnHtml
  if (
    !contentEnHtml &&
    content.contentText &&
    article.originalLanguage &&
    article.originalLanguage !== prefs.language &&
    article.originalLanguage !== 'und'
  ) {
    const translated = await translateFullContent(content.contentText, prefs.language)
    if (translated) {
      await saveTranslatedContent(id, translated)
      contentEnHtml = translated
    }
  }

  const folders = await foldersPromise

  return (
    <ArticleReadingView
      article={article}
      contentHtml={contentEnHtml ?? content.contentHtml}
      extractionError={content.extractionError}
      isTranslated={!!contentEnHtml}
      folders={folders}
    />
  )
}
