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

// Shared list row used by the Inbox/Save/Archive pages — one place for the
// archive/file button row instead of duplicating it per surface.
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
    <li
      className={
        'group transition-colors hover:bg-foreground/[0.03] ' +
        (compact ? 'border-b border-border pb-3 last:border-0 last:pb-0' : 'px-4 py-3')
      }
    >
      <div className="flex items-start gap-2.5">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={selected ?? false}
            onChange={() => onToggleSelect(item.id)}
            aria-label={`Select ${item.title}`}
            className="mt-1 shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          {/* A middot, not a pipe — the separator should recede behind the
              two values it joins, and neither is more important than the
              other, so the feed name carries no extra weight either. */}
          <div className="mb-0.5 text-base text-muted">
            {metaParts.join(' · ')}
          </div>
          {item.link ? (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={actions.handleOpen}
              className="text-lg font-medium break-words hover:text-accent hover:underline"
            >
              {item.title}
            </a>
          ) : (
            <span className="text-lg font-medium break-words">{item.title}</span>
          )}
          {item.summary && (
            <p className="mt-1 text-base leading-relaxed text-foreground-muted">{item.summary}</p>
          )}
          <ArticleCardActionsRow
            item={item}
            actions={actions}
            folders={folders}
            showFolderPicker={showFolderPicker}
            showDelete={showDelete}
          />
          {showNote && (
            <ArticleNoteEditor
              itemId={item.id}
              note={item.note}
              onChange={(note) => onUpdate(item.id, { note })}
            />
          )}
          {actions.error && <p className="mt-1 text-base text-danger">{actions.error}</p>}
        </div>
      </div>
    </li>
  )
}
