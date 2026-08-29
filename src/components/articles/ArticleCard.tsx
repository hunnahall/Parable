'use client'

import Link from 'next/link'
import type { ArticleItem } from '@/lib/dashboard/data'
import { useArticleCardActions } from './useArticleCardActions'
import ArticleCardActionsRow from './ArticleCardActionsRow'
import ArticleNoteEditor from './ArticleNoteEditor'
import ArticleTagEditor from './ArticleTagEditor'

export interface FolderOption {
  id: string
  label: string
}

function formatDate(dateString: string | null): string | null {
  if (!dateString) return null
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// Shared card used by Articles/Saved/Archive pages and the dashboard's
// article-list widgets — one place for the save/archive/tag button row
// instead of duplicating it per surface. Save/Archive/Unsave always patch
// via onUpdate; the caller's list (see useOptimisticArticleList) decides
// whether the patched item still belongs in its current view and drops it
// if not, so this component doesn't need to know what view it's in.
export default function ArticleCard({
  item,
  onUpdate,
  onRemove,
  folders,
  onFolderCreated,
  showFolderPicker = false,
  showDelete = false,
  compact = false,
  selected,
  onToggleSelect,
}: {
  item: ArticleItem
  onUpdate: (id: string, patch: Partial<ArticleItem>) => void
  onRemove: (id: string) => void
  folders?: FolderOption[]
  onFolderCreated?: (folder: FolderOption) => void
  showFolderPicker?: boolean
  showDelete?: boolean
  compact?: boolean
  // Only the Articles page's bulk toolbar passes these — undefined
  // elsewhere (Saved/Archive/dashboard widgets), which just skips
  // rendering the checkbox column.
  selected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const actions = useArticleCardActions({ item, onUpdate, onRemove, onFolderCreated })
  const showEditors = item.state === 'saved' || item.state === 'archived'

  return (
    <li className={compact ? 'border-b border-border pb-3 last:border-0 last:pb-0' : 'p-4'}>
      <div className="flex items-start gap-2">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={selected ?? false}
            onChange={() => onToggleSelect(item.id)}
            aria-label={`Select ${item.title}`}
            className="mt-1 shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted mb-0.5">
            {item.feed_title && <span className="font-medium">{item.feed_title}</span>}
            {!compact && item.category && <span>{item.category}</span>}
            {formatDate(item.published_at) && <span>{formatDate(item.published_at)}</span>}
          </div>
          <Link
            href={`/articles/${item.id}`}
            className="text-sm font-medium hover:text-accent hover:underline"
          >
            {item.title}
          </Link>
          {item.summary && <p className="text-sm text-muted mt-0.5">{item.summary}</p>}
          <ArticleCardActionsRow
            item={item}
            actions={actions}
            folders={folders}
            showFolderPicker={showFolderPicker}
            showDelete={showDelete}
          />
          {showEditors && (
            <>
              <ArticleNoteEditor
                itemId={item.id}
                note={item.note}
                onChange={(note) => onUpdate(item.id, { note })}
              />
              <ArticleTagEditor
                itemId={item.id}
                tags={item.tags}
                onChange={(tags) => onUpdate(item.id, { tags })}
              />
            </>
          )}
          {actions.error && <p className="text-xs text-danger mt-1">{actions.error}</p>}
        </div>
      </div>
    </li>
  )
}
