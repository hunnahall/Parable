import type { ArticleItem, IndicatorData, WatchlistEntry } from './data'
import type { TaskRow } from '@/lib/tasks/data'

export interface DashboardWidgetData {
  headlines: ArticleItem[]
  feeds: Record<string, ArticleItem[] | null>
  indicators: Record<string, IndicatorData | null>
  saved: ArticleItem[]
  feedCategories: Record<string, ArticleItem[] | null>
  tasks: TaskRow[]
  watchlist: WatchlistEntry[]
}
