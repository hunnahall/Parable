'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { WIDGET_LABELS, WIDGET_DEFAULT_SIZE, type WidgetType } from '@/lib/dashboard/widgets'
import type { FeedOption, IndicatorOption } from '@/lib/dashboard/data'

const WIDGET_TYPES: WidgetType[] = [
  'headlines',
  'feed',
  'indicators',
  'saved',
  'feed-category',
  'clock',
  'calendar',
]

export default function AddWidgetMenu({
  feedOptions,
  indicatorOptions,
  categoryOptions,
  onAdd,
}: {
  feedOptions: FeedOption[]
  indicatorOptions: IndicatorOption[]
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
  const [indicatorId, setIndicatorId] = useState(indicatorOptions[0]?.id ?? '')
  const [category, setCategory] = useState(categoryOptions[0] ?? '')
  const [submitting, setSubmitting] = useState(false)

  const needsFeed = widgetType === 'feed'
  const needsIndicator = widgetType === 'indicators'
  const needsCategory = widgetType === 'feed-category'
  const canSubmit =
    (!needsFeed || feedId) &&
    (!needsIndicator || indicatorId) &&
    (!needsCategory || category) &&
    !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    const config: Record<string, string> = {}
    if (needsFeed) config.feed_id = feedId
    if (needsIndicator) config.indicator_id = indicatorId
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
        className="flex items-center text-sm font-semibold rounded-full border-2 border-accent px-3 py-1.5 hover:bg-accent/10 transition-colors"
      >
        <Plus size={16} strokeWidth={2.5} className="-ms-1 me-2" aria-hidden="true" />
        Add widget
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 text-sm border border-border rounded px-3 py-2 bg-background shadow-sm">
      <select
        value={widgetType}
        onChange={(e) => setWidgetType(e.target.value as WidgetType)}
        className="border border-border rounded px-2 py-1 bg-background"
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
            className="border border-border rounded px-2 py-1 bg-background"
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

      {needsIndicator && (
        indicatorOptions.length > 0 ? (
          <select
            value={indicatorId}
            onChange={(e) => setIndicatorId(e.target.value)}
            className="border border-border rounded px-2 py-1 bg-background"
          >
            {indicatorOptions.map((indicator) => (
              <option key={indicator.id} value={indicator.id}>
                {indicator.display_name ?? indicator.id}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-muted">
            No indicators yet — add one to the indicators table first.
          </span>
        )
      )}

      {needsCategory && (
        categoryOptions.length > 0 ? (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="border border-border rounded px-2 py-1 bg-background"
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
        className="rounded-full bg-accent text-accent-foreground px-3 py-1 transition-colors hover:bg-accent/90 disabled:opacity-50"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-muted hover:text-foreground transition-colors px-1"
      >
        Cancel
      </button>
    </div>
  )
}
