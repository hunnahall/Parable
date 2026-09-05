'use client'

import type { ArticleItem } from '@/lib/articles/list'
import { formatArticleDate } from '@/lib/formatting'
import { useArticleCardActions } from './useArticleCardActions'
import ArticleCardActionsRow from './ArticleCardActionsRow'
import ArticleNoteEditor from './ArticleNoteEditor'
import type { FolderOption } from './ArticleCard'

// Best-effort favicon fallback when an article has no captured image —
// derived client-side from the article's own link origin, no ingest-time
// network fetch needed. Google's favicon service is used purely as a
// public, keyless icon lookup, not for tracking/analytics.
function faviconFor(link: string | null): string | null {
  if (!link) return null
  try {
    const origin = new URL(link).origin
    return `https://www.google.com/s2/favicons?sz=256&domain=${encodeURIComponent(origin)}`
  } catch {
    return null
  }
}

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
  // A real header image (captured at ingest — see extract.ts) fills the
  // tile full-bleed; a favicon is just a small
  // per-site icon, not a photo, so stretching it to fill the same box
  // reads as blurry/broken — shown small and centered instead, on a
  // neutral ground, until the article's actually been opened once.
  const hasRealImage = !!item.imageUrl
  const imageSrc = item.imageUrl ?? faviconFor(item.link)
  const metaParts = [item.feed_title, formatArticleDate(item.published_at)].filter(
    (part): part is string => !!part
  )

  const image = imageSrc && (
    hasRealImage ? (
      // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable source domains
      <img src={imageSrc} alt="" className="w-full h-full object-cover" />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element -- external, unpredictable source domains
      <img src={imageSrc} alt="" className="w-10 h-10 object-contain opacity-70" />
    )
  )

  return (
    <div className="card-elevated group flex flex-col overflow-hidden">
      <div className="relative aspect-[16/9] shrink-0">
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
            className="flex h-full w-full items-center justify-center bg-surface-border"
          >
            {image}
          </a>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-border">{image}</div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-3">
        <div className="mb-0.5 truncate text-base text-muted">{metaParts.join(' · ')}</div>
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
        {actions.error && <p className="text-base text-danger mt-1">{actions.error}</p>}
      </div>
    </div>
  )
}
