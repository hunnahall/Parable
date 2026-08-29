'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { WIDGET_LABELS, WIDGET_DEFAULT_SIZE, type WidgetType } from '@/lib/dashboard/widgets'
import type { FeedOption } from '@/lib/dashboard/data'

const WIDGET_TYPES: WidgetType[] = [
  'headlines',
  'feed',
  'saved',
  'feed-category',
  'clock',
  'calendar',
  'todo',
  'key-dates',
]

export default function AddWidgetMenu({
  feedOptions,
  categoryOptions,
  onAdd,
}: {
  feedOptions: FeedOption[]
  categoryOptions: string[]
  onAdd: (
    widgetType: WidgetType,
    config: Record<string, string>,
    size?: { w: number; h: number }
  ) => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [widgetType, setWidgetType] = useState<WidgetType>('headlines')
  const [feedId, setFeedId] = useState(feedOptions[0]?.id ?? '')
  const [category, setCategory] = useState(categoryOptions[0] ?? '')
  const [submitting, setSubmitting] = useState(false)

  const needsFeed = widgetType === 'feed'
  const needsCategory = widgetType === 'feed-category'
  const canSubmit =
    (!needsFeed || feedId) &&
    (!needsCategory || category) &&
    !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    const config: Record<string, string> = {}
    if (needsFeed) config.feed_id = feedId
    if (needsCategory) config.category = category
    await onAdd(widgetType, config, WIDGET_DEFAULT_SIZE[widgetType])
    setSubmitting(false)
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center text-xs font-medium border border-accent text-accent px-2.5 py-1.5 hover:bg-accent/10 transition-colors"
      >
        <Plus size={13} strokeWidth={2.5} className="-ms-0.5 me-1.5" aria-hidden="true" />
        Add widget
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 text-xs border border-accent px-2.5 py-1.5 bg-background">
      <select
        value={widgetType}
        onChange={(e) => setWidgetType(e.target.value as WidgetType)}
        className="border border-border px-2 py-1 bg-background"
      >
        {WIDGET_TYPES.map((type) => (
          <option key={type} value={type}>
            {WIDGET_LABELS[type]}
          </option>
        ))}
      </select>

      {needsFeed && (
        feedOptions.length > 0 ? (
          <select
            value={feedId}
            onChange={(e) => setFeedId(e.target.value)}
            className="border border-border px-2 py-1 bg-background"
          >
            {feedOptions.map((feed) => (
              <option key={feed.id} value={feed.id}>
                {feed.title ?? feed.id}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-muted">No feeds yet — add one to the feeds table first.</span>
        )
      )}

      {needsCategory && (
        categoryOptions.length > 0 ? (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="border border-border px-2 py-1 bg-background"
          >
            {categoryOptions.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-muted">No categories yet — add one on the Feeds page first.</span>
        )
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="bg-foreground text-background px-3 py-1 transition-colors hover:opacity-90 disabled:opacity-50"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-muted hover:text-accent transition-colors px-1"
      >
        Cancel
      </button>
    </div>
  )
}
