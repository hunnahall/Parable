'use client'

import type { ArticleItem } from '@/lib/articles/list'
import { formatArticleDate } from '@/lib/formatting'
import { useArticleCardActions } from './useArticleCardActions'
import ArticleCardActionsRow from './ArticleCardActionsRow'
import ArticleNoteEditor from './ArticleNoteEditor'

export interface FolderOption {
  id: string
  label: string
}

// Saved's list row (the card grid is ArticleCardGrid). Shares the action
// row and its handlers with the grid so the two can't drift.
// Archive/Unsave always patch via onUpdate; the caller's list (see
// useOptimisticArticleList) decides whether the patched item still belongs
// in its current view and drops it if not, so this component doesn't need
// to know what view it's in.
export default function ArticleCard({
  item,
  onUpdate,
  onRemove,
  folders,
  onFolderCreated,
  showFolderPicker = false,
  showDelete = false,
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
  // Only the bulk toolbar passes these — undefined elsewhere, which just
  // skips rendering the checkbox column.
  selected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const actions = useArticleCardActions({ item, onUpdate, onRemove, onFolderCreated })
  const showNote = item.state === 'saved' || item.state === 'archived'
  const metaParts = [item.feed_title, formatArticleDate(item.published_at)].filter(
    (part): part is string => !!part
  )

  return (
    <li className="group px-4 py-3 transition-colors hover:bg-fill-hover">
      <div className="flex items-start gap-2.5">
        {onToggleSelect && (
          <label className="cw-check mt-0.5 shrink-0">
            <input
              type="checkbox"
              checked={selected ?? false}
              onChange={() => onToggleSelect(item.id)}
              aria-label={`Select ${item.title}`}
            />
          </label>
        )}
        <div className="min-w-0 flex-1">
          {/* A middot, not a pipe — the separator should recede behind the
              two values it joins, and neither is more important than the
              other, so the feed name carries no extra weight either. */}
          <div className="mb-0.5 text-xs text-muted">
            {metaParts.join(' · ')}
          </div>
          <div className="flex items-start gap-2">
            {item.link ? (
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={actions.handleOpen}
                className="min-w-0 flex-1 text-lg font-medium break-words underline-offset-4 hover:underline"
              >
                {item.title}
              </a>
            ) : (
              <span className="min-w-0 flex-1 text-lg font-medium break-words">{item.title}</span>
            )}
          </div>
          {/* Saving writes any missing summary, so saved articles have one. */}
          {item.summary && <p className="mt-1 text-base text-foreground-muted">{item.summary}</p>}
          <ArticleCardActionsRow
            item={item}
            actions={actions}
            folders={folders}
            showFolderPicker={showFolderPicker}
            showDelete={showDelete}
          />
          {showNote && (
            <ArticleNoteEditor itemId={item.id} note={item.note} onChange={(note) => onUpdate(item.id, { note })} />
          )}
          {actions.error && <p className="mt-1 text-sm text-danger">{actions.error}</p>}
        </div>
      </div>
    </li>
  )
}
