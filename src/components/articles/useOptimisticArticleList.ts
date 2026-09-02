'use client'

import { useState } from 'react'
import type { ArticleItem } from '@/lib/dashboard/data'

// Shared optimistic-local-copy pattern used by every article list surface
// (Inbox/Read/Save/Archive pages) — router.refresh() re-runs the whole
// page's server data, so gating a visible state change on
// it makes a single save/archive/tag edit feel multi-second slow.
//
// `belongs` decides whether an item, after a patch, still matches this
// list's view — e.g. the Save page's list only wants state==='saved', so
// archiving an item there should make it disappear locally, not just show
// an updated badge.
export function useOptimisticArticleList(items: ArticleItem[], belongs: (item: ArticleItem) => boolean) {
  const [localItems, setLocalItems] = useState(items)
  const [syncedFrom, setSyncedFrom] = useState(items)
  if (items !== syncedFrom) {
    setSyncedFrom(items)
    setLocalItems(items)
  }

  function updateItem(id: string, patch: Partial<ArticleItem>) {
    setLocalItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)).filter(belongs)
    )
  }

  function removeItem(id: string) {
    setLocalItems((prev) => prev.filter((item) => item.id !== id))
  }

  function appendItems(newItems: ArticleItem[]) {
    setLocalItems((prev) => [...prev, ...newItems])
  }

  return { localItems, setLocalItems, updateItem, removeItem, appendItems }
}
