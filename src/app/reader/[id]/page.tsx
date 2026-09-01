import { redirect, notFound } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getArticleById } from '@/lib/dashboard/data'
import { listFolderOptions } from '@/lib/folders/data'
import ArticleReadingView from '@/components/articles/ArticleReadingView'

export default async function ArticleReadingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getUser()
  if (!user) redirect('/login')

  const { id } = await params
  // Independent of each other — fetched together instead of paying for
  // two sequential round trips. Note there's no content fetch here at
  // all anymore: the scrape+translate chain (up to ~35s worst case) used
  // to block this whole page from rendering. It's now fetched
  // client-side by ArticleReadingView right after the shell mounts (see
  // /api/articles/[id]/content), so the title/metadata/buttons render
  // immediately and only the article body shows a brief loading state.
  // Reachable for Saved/Archive/Reader articles alike — getArticleById has
  // no state filtering, since this one route serves all three.
  const [article, folders] = await Promise.all([getArticleById(id), listFolderOptions()])
  if (!article) notFound()

  // Keyed on id so navigating client-side from one article straight to
  // another (Next reuses the component instance across a route param
  // change in the same tree position) fully remounts rather than reusing
  // state — ArticleReadingView's content-fetch effect relies on a fresh
  // mount to reset for the new article instead of a synchronous setState
  // inside the effect body.
  return <ArticleReadingView key={id} article={article} folders={folders} />
}
