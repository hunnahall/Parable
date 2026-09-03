'use client'

import Link from 'next/link'
import type { ArticleItem } from '@/lib/articles/list'
import { prefetchArticleContent } from '@/lib/articles/contentCache'
import { formatArticleDate } from '@/lib/formatting'
import { useArticleCardActions } from './useArticleCardActions'
import ArticleCardActionsRow from './ArticleCardActionsRow'
import ArticleNoteEditor from './ArticleNoteEditor'
import ArticleTagEditor from './ArticleTagEditor'
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
  showReaderLink = true,
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
  // False only on the Inbox page — see ArticleCard's identical prop.
  showReaderLink?: boolean
  // Only the Inbox page's bulk toolbar passes these — mirrors ArticleCard.
  selected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const actions = useArticleCardActions({ item, onUpdate, onRemove, onFolderCreated })
  const showEditors = item.state === 'saved' || item.state === 'archived' || item.state === 'reading'
  // A real header image (captured on first open — see extract.ts/
  // content.ts) fills the tile full-bleed; a favicon is just a small
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
    <div className="card-elevated flex flex-col overflow-hidden">
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
        {showReaderLink ? (
          <Link
            href={`/read/${item.id}`}
            onMouseDown={() => prefetchArticleContent(item.id)}
            onTouchStart={() => prefetchArticleContent(item.id)}
            className="flex items-center justify-center w-full h-full bg-surface-border"
          >
            {image}
          </Link>
        ) : (
          <div className="flex items-center justify-center w-full h-full bg-surface-border">{image}</div>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 text-base text-muted mb-0.5">
          {metaParts.map((part, i) => (
            <span key={i} className="flex items-center gap-2 min-w-0">
              {i > 0 && <span aria-hidden="true">|</span>}
              <span className={i === 0 ? 'font-medium truncate' : 'shrink-0'}>{part}</span>
            </span>
          ))}
        </div>
        {showReaderLink ? (
          <Link
            href={`/read/${item.id}`}
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
        <div className="mt-auto pt-2">
          <ArticleCardActionsRow
            item={item}
            actions={actions}
            folders={folders}
            showFolderPicker={showFolderPicker}
            showDelete={showDelete}
            showAddToReader={!showReaderLink}
          />
        </div>
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
              onChange={(tags) => {
                const shouldSave = item.tags.length === 0 && tags.length > 0 && item.state !== 'saved'
                onUpdate(item.id, {
                  tags,
                  ...(shouldSave ? { state: 'saved' as const, archivedAt: null } : {}),
                })
              }}
            />
          </>
        )}
        {actions.error && <p className="text-base text-danger mt-1">{actions.error}</p>}
      </div>
    </div>
  )
}
