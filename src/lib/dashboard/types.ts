import type { ArticleItem } from './data'

export interface DashboardWidgetData {
  headlines: ArticleItem[]
  feeds: Record<string, ArticleItem[] | null>
  saved: ArticleItem[]
  feedCategories: Record<string, ArticleItem[] | null>
}
