'use client'

import Link from 'next/link'
import type { ArticleItem } from '@/lib/dashboard/data'
import { useArticleCardActions } from './useArticleCardActions'
import ArticleCardActionsRow from './ArticleCardActionsRow'
import type { FolderOption } from './ArticleCard'

function formatDate(dateString: string | null): string | null {
  if (!dateString) return null
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// Best-effort favicon fallback when an article has no captured image —
// derived client-side from the article's own link origin, no ingest-time
// network fetch needed. Google's favicon service is used purely as a
// public, keyless icon lookup, not for tracking/analytics.
function faviconFor(link: string | null): string | null {
  if (!link) return null
  try {
    const origin = new URL(link).origin
    return `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(origin)}`
  } catch {
    return null
  }
}

// Image-forward tile for the Articles page's Card view — sibling to
// ArticleCard (the List view), sharing the same save/archive/folder
// action row (ArticleCardActionsRow) and handler logic
// (useArticleCardActions) so the two layouts can't drift on behavior.
export default function ArticleCardGrid({
  item,
  onUpdate,
  onRemove,
  folders,
  onFolderCreated,
  showFolderPicker = false,
  showDelete = false,
}: {
  item: ArticleItem
  onUpdate: (id: string, patch: Partial<ArticleItem>) => void
  onRemove: (id: string) => void
  folders?: FolderOption[]
  onFolderCreated?: (folder: FolderOption) => void
  showFolderPicker?: boolean
  showDelete?: boolean
}) {
  const actions = useArticleCardActions({ item, onUpdate, onRemove, onFolderCreated })
  const imageSrc = item.imageUrl ?? faviconFor(item.link)

  return (
    <div className="card-elevated flex flex-col overflow-hidden">
      <Link href={`/articles/${item.id}`} className="block aspect-[16/9] bg-surface-border shrink-0">
        {imageSrc && (
          // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable source domains
          <img src={imageSrc} alt="" className="w-full h-full object-cover" />
        )}
      </Link>
      <div className="p-3 flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 text-xs text-muted mb-0.5">
          {item.feed_title && <span className="font-medium truncate">{item.feed_title}</span>}
          {formatDate(item.published_at) && <span className="shrink-0">{formatDate(item.published_at)}</span>}
        </div>
        <Link
          href={`/articles/${item.id}`}
          className="text-sm font-medium hover:text-accent hover:underline"
        >
          {item.title}
        </Link>
        {item.summary && (
          <p className="text-sm text-muted mt-0.5">
            {item.isAiSummary && (
              <span
                title="AI-generated summary"
                className="inline-block align-middle mr-1.5 text-[10px] font-medium uppercase tracking-wider border border-border-subtle text-muted px-1 py-0.5"
              >
                AI
              </span>
            )}
            {item.summary}
          </p>
        )}
        <div className="mt-auto pt-2">
          <ArticleCardActionsRow
            item={item}
            actions={actions}
            folders={folders}
            showFolderPicker={showFolderPicker}
            showDelete={showDelete}
          />
        </div>
        {actions.error && <p className="text-xs text-danger mt-1">{actions.error}</p>}
      </div>
    </div>
  )
}
