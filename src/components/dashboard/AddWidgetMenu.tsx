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
        aria-label="Add widget"
        className="flex items-center justify-center h-8 w-8 bg-accent hover:opacity-90 transition-opacity"
      >
        <Plus size={16} strokeWidth={1.75} className="text-white" aria-hidden="true" />
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 h-8 text-base border border-accent px-2 bg-background">
      <select
        value={widgetType}
        onChange={(e) => setWidgetType(e.target.value as WidgetType)}
        className="h-full border border-border px-2 bg-background"
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
            className="h-full border border-border px-2 bg-background"
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
            className="h-full border border-border px-2 bg-background"
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
        className="h-full px-2 text-accent font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="h-full text-muted hover:text-accent transition-colors px-2"
      >
        Cancel
      </button>
    </div>
  )
}
