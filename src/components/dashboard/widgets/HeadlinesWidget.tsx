import type { ArticleItem } from '@/lib/dashboard/data'
import ArticleList from './ArticleList'

export default function HeadlinesWidget({ items }: { items: ArticleItem[] }) {
  return <ArticleList items={items} />
}
