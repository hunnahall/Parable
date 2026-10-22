'use client'

import { useState } from 'react'
import type { ArticleItem } from '@/lib/articles/list'
import { formatArticleDate } from '@/lib/formatting'
import { useArticleCardActions } from './useArticleCardActions'
import ArticleCardActionsRow from './ArticleCardActionsRow'
import ArticleNoteEditor from './ArticleNoteEditor'
import type { FolderOption } from './ArticleCard'

// Image-forward tile for the Card display mode — sibling to ArticleCard
// (the List mode), sharing the same archive/file action row
// (ArticleCardActionsRow) and handler logic (useArticleCardActions) so the
// two layouts can't drift on behavior.
export default function ArticleCardGrid({
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
  // Only the bulk toolbar passes these — mirrors ArticleCard.
  selected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const actions = useArticleCardActions({ item, onUpdate, onRemove, onFolderCreated })
  const showNote = item.state === 'saved' || item.state === 'archived'
  // The article's image (R3 rules: https only, a plain img with no referrer
  // and no proxy, removed if it fails). No image, no box: the card starts
  // with its text. No third-party favicon service either, which would tell
  // it which sites the reader follows.
  const [imageFailed, setImageFailed] = useState(false)
  const imageSrc = !imageFailed && item.imageUrl?.startsWith('https://') ? item.imageUrl : null
  const metaParts = [item.feed_title, formatArticleDate(item.published_at)].filter(
    (part): part is string => !!part
  )

  const image = imageSrc && (
    // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable source domains
    <img
      src={imageSrc}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setImageFailed(true)}
      className="h-full w-full object-cover"
    />
  )

  return (
    <div className="card-elevated group flex flex-col overflow-hidden">
      {(image || onToggleSelect) && (
        <div className={`relative shrink-0 ${image ? 'aspect-[16/9] border-b border-border' : 'h-8'}`}>
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={selected ?? false}
              onChange={() => onToggleSelect(item.id)}
              aria-label={`Select ${item.title}`}
              className="absolute top-2 left-2 z-10"
            />
          )}
          {item.link ? (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={actions.handleOpen}
              aria-label={item.title}
              className="flex h-full w-full items-center justify-center bg-fill-active"
            >
              {image}
            </a>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-fill-active">{image}</div>
          )}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col p-3">
        <div className="mb-0.5 truncate text-xs text-muted">{metaParts.join(' · ')}</div>
        {item.link ? (
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={actions.handleOpen}
            className="text-lg font-medium break-words underline-offset-4 hover:underline"
          >
            {item.title}
          </a>
        ) : (
          <span className="text-lg font-medium break-words">{item.title}</span>
        )}
        {item.summary && <p className="mt-1 text-base text-foreground-muted">{item.summary}</p>}
        <div className="mt-auto pt-2">
          <ArticleCardActionsRow
            item={item}
            actions={actions}
            folders={folders}
            showFolderPicker={showFolderPicker}
            showDelete={showDelete}
            alwaysVisible
          />
        </div>
        {showNote && (
          <ArticleNoteEditor
            itemId={item.id}
            note={item.note}
            onChange={(note) => onUpdate(item.id, { note })}
          />
        )}
        {actions.error && <p className="text-sm text-danger mt-1">{actions.error}</p>}
      </div>
    </div>
  )
}
