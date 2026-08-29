// Next's file-based loading convention wraps this route segment's page in
// an automatic Suspense boundary — this renders immediately on
// navigation, before the page's own getArticleById/listFolderOptions
// resolve. The scrape+translate chain itself isn't even on this path
// anymore (see ArticleReadingView.tsx) — it's fetched client-side after
// the shell mounts, with its own in-component loading state.
export default function ArticleLoading() {
  return (
    <div className="max-w-2xl mx-auto p-8 animate-pulse">
      <div className="h-4 w-32 bg-surface-border mb-6" />
      <div className="h-3 w-48 bg-surface-border mb-2" />
      <div className="h-7 w-full bg-surface-border mb-1" />
      <div className="h-7 w-2/3 bg-surface-border mb-4" />
      <div className="h-4 w-40 bg-surface-border mb-6" />
      <hr className="border-border-subtle mb-6" />
      <div className="space-y-3">
        <div className="h-4 w-full bg-surface-border" />
        <div className="h-4 w-full bg-surface-border" />
        <div className="h-4 w-5/6 bg-surface-border" />
        <div className="h-4 w-full bg-surface-border" />
        <div className="h-4 w-3/4 bg-surface-border" />
      </div>
    </div>
  )
}
