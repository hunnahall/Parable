import type { ArticleItem, IndicatorData } from './data'

export interface DashboardWidgetData {
  headlines: ArticleItem[]
  feeds: Record<string, ArticleItem[]>
  indicators: Record<string, IndicatorData | null>
}
