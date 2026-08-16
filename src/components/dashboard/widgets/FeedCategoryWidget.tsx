import type { ArticleItem } from '@/lib/dashboard/data'
import ArticleList from './ArticleList'

export default function FeedCategoryWidget({ items }: { items: ArticleItem[] | null }) {
  if (items === null) {
    return <p className="text-sm text-muted">Category not found.</p>
  }
  return <ArticleList items={items} />
}
