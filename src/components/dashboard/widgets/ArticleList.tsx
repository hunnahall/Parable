import type { ArticleItem } from '@/lib/dashboard/data'

function formatDate(dateString: string | null): string | null {
  if (!dateString) return null
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function ArticleList({ items }: { items: ArticleItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500">No articles yet.</p>
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-0.5">
            {item.feed_title && <span className="font-medium">{item.feed_title}</span>}
            {formatDate(item.published_at) && <span>{formatDate(item.published_at)}</span>}
          </div>
          {item.link ? (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium hover:underline"
            >
              {item.title}
            </a>
          ) : (
            <p className="text-sm font-medium">{item.title}</p>
          )}
          {item.summary && (
            <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">{item.summary}</p>
          )}
        </li>
      ))}
    </ul>
  )
}
