export interface ArticleContentResponse {
  contentHtml: string | null
  extractionError: string | null
  isTranslated: boolean
  error?: string
}

// Module-level, tab-lifetime cache of in-flight/completed content fetches,
// keyed by article id. Lets prefetchArticleContent (fired from a card's
// onMouseDown/onTouchStart/onFocus, well before the reading view mounts)
// and ArticleReadingView's own fetch effect share one request instead of
// issuing two — the point being to overlap the route transition with the
// scrape+translate chain (up to ~35s worst case, see
// /api/articles/[id]/content) rather than only starting it once the
// article page has fully mounted.
const cache = new Map<string, Promise<ArticleContentResponse>>()

function fetchContent(id: string): Promise<ArticleContentResponse> {
  return fetch(`/api/articles/${id}/content`).then((res) => res.json())
}

// Fire-and-forget: safe to call repeatedly for the same id (e.g. a mouse
// re-entering a card) since it only starts a request the first time.
export function prefetchArticleContent(id: string): void {
  if (cache.has(id)) return
  const promise = fetchContent(id)
  cache.set(id, promise)
  // Swallow here so an article that's warmed but never opened doesn't
  // surface as an unhandled rejection — a real caller via
  // getArticleContent below still sees the rejection on its own chain.
  promise.catch(() => {})
}

// Used by ArticleReadingView: reuses a prefetch already in flight for this
// id, or starts a fresh request if nothing warmed it.
export function getArticleContent(id: string): Promise<ArticleContentResponse> {
  const existing = cache.get(id)
  if (existing) return existing
  const promise = fetchContent(id)
  cache.set(id, promise)
  return promise
}
