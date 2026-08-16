'use client'

import { WIDGET_LABELS, type WidgetInstance } from '@/lib/dashboard/widgets'
import type { DashboardWidgetData } from '@/lib/dashboard/types'
import HeadlinesWidget from './widgets/HeadlinesWidget'
import FeedWidget from './widgets/FeedWidget'
import IndicatorsWidget from './widgets/IndicatorsWidget'
import FeedCategoryWidget from './widgets/FeedCategoryWidget'
import ClockWidget from './widgets/ClockWidget'
import CalendarWidget from './widgets/CalendarWidget'

export default function WidgetCard({
  widget,
  data,
  onRemove,
}: {
  widget: WidgetInstance
  data: DashboardWidgetData
  onRemove: (id: string) => void
}) {
  const label =
    widget.widget_type === 'feed-category' && widget.config.category
      ? `${widget.config.category} Feed`
      : WIDGET_LABELS[widget.widget_type]

  return (
    <div className="h-full flex flex-col rounded-lg border border-border bg-background shadow-sm overflow-hidden">
      <div className="widget-drag-handle flex items-center justify-between px-3 py-2 border-b border-border cursor-move shrink-0">
        <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
          {label}
        </span>
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => onRemove(widget.id)}
          className="flex items-center justify-center w-5 h-5 rounded-full text-muted hover:bg-foreground/5 hover:text-foreground text-sm leading-none transition-colors"
          aria-label="Remove widget"
        >
          ×
        </button>
      </div>
      <div className="p-3 overflow-auto grow">
        {widget.widget_type === 'headlines' && <HeadlinesWidget items={data.headlines} />}
        {widget.widget_type === 'feed' && (
          <FeedWidget items={data.feeds[widget.config.feed_id] ?? null} />
        )}
        {widget.widget_type === 'indicators' && (
          <IndicatorsWidget data={data.indicators[widget.config.indicator_id] ?? null} />
        )}
        {widget.widget_type === 'saved' && <HeadlinesWidget items={data.saved} />}
        {widget.widget_type === 'feed-category' && (
          <FeedCategoryWidget items={data.feedCategories[widget.config.category] ?? null} />
        )}
        {widget.widget_type === 'clock' && <ClockWidget />}
        {widget.widget_type === 'calendar' && <CalendarWidget />}
      </div>
    </div>
  )
}
