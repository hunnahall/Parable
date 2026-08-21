import type { ArticleItem } from '@/lib/dashboard/data'
import ArticleList from './ArticleList'

export default function HeadlinesWidget({
  items,
  savedOnly = false,
}: {
  items: ArticleItem[]
  savedOnly?: boolean
}) {
  return <ArticleList items={items} savedOnly={savedOnly} />
}
