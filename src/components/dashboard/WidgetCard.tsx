'use client'

import { X } from 'lucide-react'
import { WIDGET_LABELS, type WidgetInstance } from '@/lib/dashboard/widgets'
import type { DashboardWidgetData } from '@/lib/dashboard/types'
import HeadlinesWidget from './widgets/HeadlinesWidget'
import FeedWidget from './widgets/FeedWidget'
import FeedCategoryWidget from './widgets/FeedCategoryWidget'
import ClockWidget from './widgets/ClockWidget'
import CalendarWidget from './widgets/CalendarWidget'

export default function WidgetCard({
  widget,
  data,
  onRemove,
  revealDelayMs,
}: {
  widget: WidgetInstance
  data: DashboardWidgetData
  onRemove: (id: string) => void
  revealDelayMs?: number
}) {
  const label =
    widget.widget_type === 'feed-category' && widget.config.category
      ? `${widget.config.category} Feed`
      : WIDGET_LABELS[widget.widget_type]

  return (
    <div
      className="card-elevated card-elevated-interactive animate-widget-reveal h-full flex flex-col overflow-hidden"
      style={
        revealDelayMs !== undefined
          ? ({ '--reveal-delay': `${revealDelayMs}ms` } as React.CSSProperties)
          : undefined
      }
    >
      <div className="widget-drag-handle flex items-center justify-between px-3 py-2 border-b border-border cursor-move shrink-0">
        <span className="text-sm font-semibold text-foreground uppercase tracking-wide">
          {label}
        </span>
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => onRemove(widget.id)}
          className="flex items-center justify-center w-5 h-5 text-muted hover:bg-foreground/5 hover:text-foreground text-sm leading-none transition-colors"
          aria-label="Remove widget"
        >
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
      <div className="p-3 overflow-auto grow">
        {widget.widget_type === 'headlines' && <HeadlinesWidget items={data.headlines} />}
        {widget.widget_type === 'feed' && (
          <FeedWidget items={data.feeds[widget.config.feed_id] ?? null} />
        )}
        {widget.widget_type === 'saved' && <HeadlinesWidget items={data.saved} savedOnly />}
        {widget.widget_type === 'feed-category' && (
          <FeedCategoryWidget items={data.feedCategories[widget.config.category] ?? null} />
        )}
        {widget.widget_type === 'clock' && <ClockWidget />}
        {widget.widget_type === 'calendar' && <CalendarWidget />}
      </div>
    </div>
  )
}
