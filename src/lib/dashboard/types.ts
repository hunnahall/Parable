import type { ArticleItem } from './data'
import type { TaskRow } from '@/lib/tasks/data'
import type { KeyDateRow } from '@/lib/keydates/data'

export interface DashboardWidgetData {
  headlines: ArticleItem[]
  feeds: Record<string, ArticleItem[] | null>
  saved: ArticleItem[]
  feedCategories: Record<string, ArticleItem[] | null>
  tasks: TaskRow[]
  keyDates: KeyDateRow[]
}
