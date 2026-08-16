import type { ArticleItem, IndicatorData } from './data'

export interface DashboardWidgetData {
  headlines: ArticleItem[]
  feeds: Record<string, ArticleItem[] | null>
  indicators: Record<string, IndicatorData | null>
  saved: ArticleItem[]
  feedCategories: Record<string, ArticleItem[] | null>
}
