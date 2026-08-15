'use client'

import { WIDGET_LABELS, type WidgetInstance } from '@/lib/dashboard/widgets'
import type { DashboardWidgetData } from '@/lib/dashboard/types'
import HeadlinesWidget from './widgets/HeadlinesWidget'
import FeedWidget from './widgets/FeedWidget'
import IndicatorsWidget from './widgets/IndicatorsWidget'

export default function WidgetCard({
  widget,
  data,
  onRemove,
}: {
  widget: WidgetInstance
  data: DashboardWidgetData
  onRemove: (id: string) => void
}) {
  return (
    <div className="h-full flex flex-col rounded-lg border bg-white shadow-sm overflow-hidden">
      <div className="widget-drag-handle flex items-center justify-between px-3 py-2 border-b bg-gray-50 cursor-move shrink-0">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {WIDGET_LABELS[widget.widget_type]}
        </span>
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => onRemove(widget.id)}
          className="text-gray-400 hover:text-gray-700 text-sm leading-none px-1"
          aria-label="Remove widget"
        >
          ×
        </button>
      </div>
      <div className="p-3 overflow-auto grow">
        {widget.widget_type === 'headlines' && <HeadlinesWidget items={data.headlines} />}
        {widget.widget_type === 'feed' && (
          <FeedWidget items={data.feeds[widget.config.feed_id] ?? []} />
        )}
        {widget.widget_type === 'indicators' && (
          <IndicatorsWidget data={data.indicators[widget.config.indicator_id] ?? null} />
        )}
        {widget.widget_type === 'saved' && <HeadlinesWidget items={data.saved} />}
      </div>
    </div>
  )
}
