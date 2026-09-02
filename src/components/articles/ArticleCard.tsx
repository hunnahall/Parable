'use client'

import Link from 'next/link'
import type { ArticleItem } from '@/lib/dashboard/data'
import { prefetchArticleContent } from '@/lib/articles/contentCache'
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

// Shared card used by the Inbox/Reader/Saved/Archive pages — one place for
// the save/archive/tag button row instead of duplicating it per surface.
// Save/Archive/Unsave always patch
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
  showReaderLink = true,
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
  // elsewhere, which just skips rendering the checkbox column.
  selected?: boolean
  onToggleSelect?: (id: string) => void
  // False only on the Inbox page: Inbox articles have no full reading view
  // (see the plan for the Reader feature) — the title renders as plain
  // text and "Add to Reader" replaces it as the way to open one.
  showReaderLink?: boolean
}) {
  const actions = useArticleCardActions({ item, onUpdate, onRemove, onFolderCreated })
  const showEditors = item.state === 'saved' || item.state === 'archived'
  const metaParts = [
    item.feed_title,
    !compact ? item.category : null,
    formatDate(item.published_at),
  ].filter((part): part is string => !!part)

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
          <div className="flex items-center gap-2 text-base text-muted mb-0.5">
            {metaParts.map((part, i) => (
              <span key={i} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden="true">|</span>}
                <span className={i === 0 ? 'font-medium' : undefined}>{part}</span>
              </span>
            ))}
          </div>
          {showReaderLink ? (
            <Link
              href={`/reader/${item.id}`}
              onMouseDown={() => prefetchArticleContent(item.id)}
              onTouchStart={() => prefetchArticleContent(item.id)}
              onFocus={() => prefetchArticleContent(item.id)}
              className="text-lg font-medium hover:text-accent hover:underline break-words"
            >
              {item.title}
            </Link>
          ) : (
            <span className="text-lg font-medium break-words">{item.title}</span>
          )}
          {item.summary && (
            <p className="text-lg text-muted mt-0.5">
              {item.isAiSummary && (
                <span
                  title="AI-generated summary"
                  className="inline-block align-middle mr-1.5 text-sm font-medium uppercase tracking-wider border border-border-subtle text-muted px-1 py-0.5"
                >
                  AI
                </span>
              )}
              {item.summary}
            </p>
          )}
          <ArticleCardActionsRow
            item={item}
            actions={actions}
            folders={folders}
            showFolderPicker={showFolderPicker}
            showDelete={showDelete}
            showAddToReader={!showReaderLink}
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
          {actions.error && <p className="text-base text-danger mt-1">{actions.error}</p>}
        </div>
      </div>
    </li>
  )
}
