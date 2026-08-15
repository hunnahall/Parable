'use client'

import { useState } from 'react'
import { WIDGET_LABELS, type WidgetType } from '@/lib/dashboard/widgets'
import type { FeedOption, IndicatorOption } from '@/lib/dashboard/data'

const WIDGET_TYPES: WidgetType[] = ['headlines', 'feed', 'indicators']

export default function AddWidgetMenu({
  feedOptions,
  indicatorOptions,
  onAdd,
}: {
  feedOptions: FeedOption[]
  indicatorOptions: IndicatorOption[]
  onAdd: (widgetType: WidgetType, config: Record<string, string>) => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [widgetType, setWidgetType] = useState<WidgetType>('headlines')
  const [feedId, setFeedId] = useState(feedOptions[0]?.id ?? '')
  const [indicatorId, setIndicatorId] = useState(indicatorOptions[0]?.id ?? '')
  const [submitting, setSubmitting] = useState(false)

  const needsFeed = widgetType === 'feed'
  const needsIndicator = widgetType === 'indicators'
  const canSubmit = (!needsFeed || feedId) && (!needsIndicator || indicatorId) && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    const config: Record<string, string> = {}
    if (needsFeed) config.feed_id = feedId
    if (needsIndicator) config.indicator_id = indicatorId
    await onAdd(widgetType, config)
    setSubmitting(false)
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm rounded border px-3 py-1.5 hover:bg-gray-50"
      >
        + Add widget
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 text-sm border rounded px-3 py-2 bg-white shadow-sm">
      <select
        value={widgetType}
        onChange={(e) => setWidgetType(e.target.value as WidgetType)}
        className="border rounded px-2 py-1"
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
            className="border rounded px-2 py-1"
          >
            {feedOptions.map((feed) => (
              <option key={feed.id} value={feed.id}>
                {feed.title ?? feed.id}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-gray-500">No feeds yet — add one to the feeds table first.</span>
        )
      )}

      {needsIndicator && (
        indicatorOptions.length > 0 ? (
          <select
            value={indicatorId}
            onChange={(e) => setIndicatorId(e.target.value)}
            className="border rounded px-2 py-1"
          >
            {indicatorOptions.map((indicator) => (
              <option key={indicator.id} value={indicator.id}>
                {indicator.display_name ?? indicator.id}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-gray-500">
            No indicators yet — add one to the indicators table first.
          </span>
        )
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="rounded bg-black text-white px-3 py-1 disabled:opacity-50"
      >
        Add
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-gray-400 px-1">
        Cancel
      </button>
    </div>
  )
}
