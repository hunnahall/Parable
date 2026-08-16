import type { ArticleItem } from '@/lib/dashboard/data'
import ArticleList from './ArticleList'

export default function FeedWidget({ items }: { items: ArticleItem[] | null }) {
  if (items === null) {
    return <p className="text-sm text-muted">Feed not found.</p>
  }
  return <ArticleList items={items} />
}
