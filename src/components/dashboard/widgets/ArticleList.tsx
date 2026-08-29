'use client'

import { useMemo, useState } from 'react'
import type { ArticleItem } from '@/lib/dashboard/data'
import { useOptimisticArticleList } from '@/components/articles/useOptimisticArticleList'
import ArticleCard from '@/components/articles/ArticleCard'

export default function ArticleList({
  items,
  savedOnly = false,
}: {
  items: ArticleItem[]
  // True for widgets whose underlying query already filters to state ===
  // 'saved' (the "Saved articles" widget) — an unsave/archive there means
  // the item no longer belongs in this list at all, not just a state
  // change, so it should disappear locally rather than stay with an
  // updated badge. Non-saved widgets (headlines/feed/category) exclude
  // archived articles but keep showing saved ones inline.
  savedOnly?: boolean
}) {
  const [tagFilter, setTagFilter] = useState<string | null>(null)

  function belongs(item: ArticleItem): boolean {
    return savedOnly ? item.state === 'saved' : item.state !== 'archived'
  }

  const { localItems, updateItem, removeItem } = useOptimisticArticleList(items, belongs)

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const item of localItems) {
      for (const tag of item.tags) set.add(tag)
    }
    return [...set].sort()
  }, [localItems])

  const visibleItems = tagFilter ? localItems.filter((item) => item.tags.includes(tagFilter)) : localItems

  if (items.length === 0) {
    return <p className="text-lg text-muted">No articles yet.</p>
  }

  return (
    <div>
      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 text-base mb-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setTagFilter(null)}
            className={
              tagFilter === null
                ? 'shrink-0 border border-accent text-accent bg-accent/10 px-2.5 py-0.5 transition-colors'
                : 'shrink-0 border border-border text-muted px-2.5 py-0.5 hover:border-accent hover:text-accent transition-colors'
            }
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setTagFilter(tag)}
              className={
                tagFilter === tag
                  ? 'shrink-0 border border-accent text-accent bg-accent/10 px-2.5 py-0.5 transition-colors'
                  : 'shrink-0 border border-border text-muted px-2.5 py-0.5 hover:border-accent hover:text-accent transition-colors'
              }
            >
              {tag}
            </button>
          ))}
        </div>
      )}
      <ul className="space-y-3">
        {visibleItems.map((item) => (
          <ArticleCard key={item.id} item={item} onUpdate={updateItem} onRemove={removeItem} compact />
        ))}
      </ul>
    </div>
  )
}
