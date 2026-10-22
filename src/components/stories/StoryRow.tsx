'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, BookOpen, ChevronDown, Ellipsis, EyeOff, ExternalLink, FolderPlus, Sparkles } from 'lucide-react'
import type { Story } from '@/lib/stories/data'
import type { StoryViewMode } from './StoryList'
import { markArticleRead } from '@/lib/articles/actions'
import { addFolder } from '@/lib/folders/actions'
import { formatAge } from '@/lib/formatting'
import { languageLabel } from '@/lib/languages'
import ArticleFolderPicker from '@/components/articles/ArticleFolderPicker'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Tooltip from '@/components/ui/Tooltip'
import HideWordDialog from './HideWordDialog'
import ReaderView from './ReaderView'
import StorySummary from './StorySummary'
import { saveStory } from './saveStory'
import { Input } from '@/components/ui/Input'

export interface FolderOption {
  id: string
  label: string
}

// On screen this long (and at least half visible) counts as seen.
const SEEN_AFTER_MS = 1000
// Reading speed for the meta line's read time.
const WORDS_PER_MINUTE = 220
// Tagged languages: two-letter codes other than English. 'und' (undetectable)
// and three-letter codes (detection found no common language, e.g. 'sco'
// for an English headline) get no tag.
function taggedLanguage(code: string | null): string | null {
  return code && code !== 'en' && /^[a-z]{2}$/.test(code) ? code : null
}

// Only https images and icons, so a page never loads mixed content.
function httpsUrl(url: string | null): string | null {
  return url?.startsWith('https://') ? url : null
}

function faviconFor(link: string | null): string | null {
  if (!httpsUrl(link)) return null
  try {
    return `${new URL(link!).origin}/favicon.ico`
  } catch {
    return null
  }
}

// One story: the newest source's title and feed, a count of the feeds
// covering it, a thumbnail when a source has an image, and its actions.
// Unseen titles are semibold; seen ones drop to regular weight in the
// secondary text color. Archiving and saving apply to every source
// the reader can see, so the story leaves or is kept as a whole.
//
// Desktop shows the actions as icons on hover. On phone (under 640px) tapping the
// story opens a panel with them instead, since there's no hover.
export default function StoryRow({
  story,
  view,
  folders,
  seen = false,
  leaving = false,
  selectedInPane = false,
  compact = false,
  onSelect,
  onSeen,
  onFolderCreated,
  onArchive,
  onUnarchive,
  onSaved,
}: {
  story: Story
  view: StoryViewMode
  folders: FolderOption[]
  seen?: boolean
  leaving?: boolean
  // At 1280px and up the Inbox has a reading pane: the title and Reader
  // view open the story there instead of the publisher or the modal.
  selectedInPane?: boolean
  // The front page's tighter rows: less padding, smaller titles.
  compact?: boolean
  onSelect?: (story: Story) => void
  onSeen?: (story: Story) => void
  onFolderCreated: (folder: FolderOption) => void
  onArchive: (story: Story) => void
  onUnarchive: (story: Story) => void
  onSaved: (story: Story) => void
}) {
  const router = useRouter()
  const rowRef = useRef<HTMLLIElement>(null)
  const [showSources, setShowSources] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [hideWordOpen, setHideWordOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [readerOpen, setReaderOpen] = useState(false)
  const [addingFolder, setAddingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [pending, setPending] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const [faviconFailed, setFaviconFailed] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)

  const lead = story.sources[0]
  // The badge counts feeds, per context.md: two feeds from one outlet are
  // two, and one feed posting an update to its own story is one.
  const feedCount = new Set(story.sources.map((s) => s.feedId)).size
  const extraCount = story.sources.length - 1
  const age = formatAge(lead.publishedAt ?? lead.createdAt)
  const readTime = lead.wordCount ? `${Math.max(1, Math.ceil(lead.wordCount / WORDS_PER_MINUTE))} min` : null
  const meta = [lead.feedTitle, age, readTime].filter(Boolean).join(' · ')
  const language = taggedLanguage(lead.language)
  // Newest source with an image first.
  const image = imageFailed ? null : (story.sources.map((s) => httpsUrl(s.imageUrl)).find(Boolean) ?? null)
  const favicon = faviconFailed ? null : faviconFor(lead.link)
  const titleWeight = seen ? 'font-normal text-foreground-muted' : 'font-semibold text-foreground'
  const selected = readerOpen || panelOpen || selectedInPane

  function openReader() {
    if (onSelect) onSelect(story)
    else setReaderOpen(true)
  }

  // Seen tracking. Restarts when the story gains a source, since that
  // makes it unseen again.
  useEffect(() => {
    const el = rowRef.current
    if (!onSeen || seen || !el) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timer ??= setTimeout(() => onSeen(story), SEEN_AFTER_MS)
        } else if (timer) {
          clearTimeout(timer)
          timer = null
        }
      },
      { threshold: 0.5 }
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (timer) clearTimeout(timer)
    }
  }, [onSeen, seen, story])

  useEffect(() => {
    if (!moreOpen) return
    function onPointerDown(e: PointerEvent) {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [moreOpen])

  async function saveTo(folderIds: string[]) {
    if (folderIds.length === 0) return
    setPending(true)
    setError(null)
    const saveError = await saveStory(story, folderIds)
    setPending(false)
    if (saveError) {
      setError(saveError)
      return
    }
    setPanelOpen(false)
    onSaved(story)
    router.refresh()
  }

  async function createFolderAndSave() {
    const name = newFolderName.trim()
    setNewFolderName('')
    setAddingFolder(false)
    if (!name) return
    const result = await addFolder({ name, parentId: null })
    if (result.error || !result.id) {
      setError(result.error ?? 'Folder not created')
      return
    }
    onFolderCreated({ id: result.id, label: name })
    await saveTo([result.id])
  }

  function archiveOrRestore() {
    setPanelOpen(false)
    if (view === 'inbox') onArchive(story)
    else onUnarchive(story)
  }

  const archiveLabel = view === 'inbox' ? 'Archive' : 'Move to Inbox'
  // Icon buttons grow to the 40px touch size where there's no hover.
  const iconButton = 'cw-btn cw-btn--ghost cw-btn--sm cw-btn--icon [@media(hover:none)]:size-10!'

  return (
    <li
      ref={rowRef}
      // Collapses to nothing before leaving the list (archive, save, restore).
      className={`grid transition-[grid-template-rows] duration-[var(--dur-std)] ease-[var(--ease-out)] ${leaving ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}
    >
      {/* Clipped only while collapsing, so menus can overflow the row. */}
      <div className={`min-h-0 ${leaving ? 'overflow-hidden' : ''}`}>
        <div
          className={`group flex gap-3 px-4 transition-colors ${compact ? 'py-2' : 'py-3'} duration-[var(--dur-std)] hover:bg-fill-hover ${
            selected ? 'bg-accent-soft shadow-[inset_2px_0_0_var(--accent)] hover:bg-accent-soft' : ''
          }`}
        >
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              {favicon && (
                // A plain img: no Vercel image-optimization quota, no proxy.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={favicon}
                  alt=""
                  width={16}
                  height={16}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={() => setFaviconFailed(true)}
                  className="size-4 shrink-0 grayscale transition-[filter] duration-[var(--dur-fast)] group-hover:grayscale-0"
                />
              )}
              <span suppressHydrationWarning>{meta}</span>
              {language && (
                <Tooltip label={languageLabel(language)}>
                  <span className="cw-tag" aria-label={languageLabel(language)}>
                    {language.toUpperCase()}
                  </span>
                </Tooltip>
              )}
              {extraCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowSources((v) => !v)}
                  aria-expanded={showSources}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  {feedCount > 1 ? (
                    <Badge>{feedCount} feeds</Badge>
                  ) : (
                    <span>
                      {extraCount} more {extraCount === 1 ? 'article' : 'articles'}
                    </span>
                  )}
                  <ChevronDown
                    size={14}
                    strokeWidth={1.5}
                    aria-hidden="true"
                    className={`transition-transform ${showSources ? 'rotate-180' : ''}`}
                  />
                </button>
              )}
            </div>

            {/* Phone: the title opens the action panel. */}
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className={`block w-full break-words text-left ${compact ? 'text-base' : 'text-lg'} min-[640px]:hidden ${titleWeight}`}
            >
              {lead.title}
            </button>
            {/* Desktop: the title goes to the publisher. */}
            <div className="hidden min-[640px]:block">
              {lead.link ? (
                <a
                  href={lead.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    // With the pane, a plain click reads it there; a
                    // modified click (new tab) still goes to the publisher.
                    if (onSelect && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)) {
                      e.preventDefault()
                      onSelect(story)
                      return
                    }
                    void markArticleRead(lead.id)
                  }}
                  aria-current={selectedInPane ? 'true' : undefined}
                  className={`block break-words ${compact ? 'text-base' : 'text-lg'} underline-offset-4 hover:underline ${titleWeight}`}
                >
                  {lead.title}
                </a>
              ) : (
                <span className={`block break-words ${compact ? 'text-base' : 'text-lg'} ${titleWeight}`}>{lead.title}</span>
              )}
            </div>

            {showSources && (
              <ul className="mt-2 space-y-1 border-l border-border pl-3">
                {story.sources.slice(1).map((source) => (
                  <li key={source.id} className="text-sm">
                    <span className="text-xs text-muted">{source.feedTitle} · </span>
                    {source.link ? (
                      <a
                        href={source.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => void markArticleRead(source.id)}
                        className="underline-offset-4 hover:underline"
                      >
                        {source.title}
                      </a>
                    ) : (
                      source.title
                    )}
                  </li>
                ))}
              </ul>
            )}

            {summaryOpen && <StorySummary story={story} />}

            <div className="-ml-2 mt-1.5 hidden items-center gap-1 opacity-0 transition-opacity duration-[var(--dur-fast)] group-hover:opacity-100 group-focus-within:opacity-100 min-[640px]:flex [@media(hover:none)]:opacity-100">
              <Tooltip label="Summary">
                <button
                  type="button"
                  onClick={() => setSummaryOpen((v) => !v)}
                  aria-expanded={summaryOpen}
                  aria-label="Summary"
                  className={`${iconButton} ${summaryOpen ? 'text-foreground' : ''}`}
                >
                  <Sparkles strokeWidth={1.5} aria-hidden="true" />
                </button>
              </Tooltip>
              <Tooltip label="Reader view">
                <button type="button" onClick={openReader} aria-label="Reader view" className={iconButton}>
                  <BookOpen strokeWidth={1.5} aria-hidden="true" />
                </button>
              </Tooltip>
              <Tooltip label="Save">
                <ArticleFolderPicker
                  selectedIds={[]}
                  folders={folders}
                  onChange={saveTo}
                  addingFolder={addingFolder}
                  setAddingFolder={setAddingFolder}
                  newFolderName={newFolderName}
                  setNewFolderName={setNewFolderName}
                  onCreateFolder={createFolderAndSave}
                  disabled={pending}
                  iconOnly
                  buttonClassName="[@media(hover:none)]:size-10!"
                />
              </Tooltip>
              <Tooltip label={archiveLabel}>
                <button type="button" disabled={pending} onClick={archiveOrRestore} aria-label={archiveLabel} className={iconButton}>
                  {view === 'inbox' ? (
                    <Archive strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <ArchiveRestore strokeWidth={1.5} aria-hidden="true" />
                  )}
                </button>
              </Tooltip>
              {(view === 'inbox' || lead.link) && (
                <div ref={moreRef} className="relative">
                  <Tooltip label="More">
                    <button
                      type="button"
                      onClick={() => setMoreOpen((v) => !v)}
                      aria-expanded={moreOpen}
                      aria-haspopup="menu"
                      aria-label="More actions"
                      className={iconButton}
                    >
                      <Ellipsis strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </Tooltip>
                  {moreOpen && (
                    <div role="menu" className="cw-menu absolute left-0 top-full z-30 mt-1">
                      {view === 'inbox' && (
                        <button
                          type="button"
                          role="menuitem"
                          disabled={pending}
                          onClick={() => {
                            setMoreOpen(false)
                            setHideWordOpen(true)
                          }}
                          className="cw-menu__item"
                        >
                          <EyeOff strokeWidth={1.5} aria-hidden="true" />
                          Hide stories with a word
                        </button>
                      )}
                      {lead.link && (
                        <a
                          href={lead.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          role="menuitem"
                          onClick={() => {
                            void markArticleRead(lead.id)
                            setMoreOpen(false)
                          }}
                          className="cw-menu__item no-underline"
                        >
                          <ExternalLink strokeWidth={1.5} aria-hidden="true" />
                          Open {lead.feedTitle ?? 'publisher'}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            {error && <p className="mt-1 text-sm text-danger">{error}</p>}
          </div>

          {image && (
            // A plain img: no Vercel image-optimization quota, no proxy.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              width={96}
              height={64}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
              className="h-14 w-20 shrink-0 border border-border bg-fill-active object-cover min-[640px]:h-16 min-[640px]:w-24"
            />
          )}
        </div>
      </div>

      <Modal open={panelOpen} onClose={() => setPanelOpen(false)} title={lead.title} labelledBy={`story-panel-${story.id}`}>
        <div className="space-y-4">
          <p className="text-xs text-muted" suppressHydrationWarning>
            {meta}
            {feedCount > 1 && ` · ${feedCount} feeds`}
          </p>
          <div className="flex flex-col items-stretch gap-1">
            {lead.link && (
              <a
                href={lead.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  void markArticleRead(lead.id)
                  setPanelOpen(false)
                }}
                className="cw-btn cw-btn--ghost justify-start"
              >
                <ExternalLink strokeWidth={1.5} aria-hidden="true" />
                Open {lead.feedTitle ?? 'publisher'}
              </a>
            )}
            <button
              type="button"
              onClick={() => {
                setPanelOpen(false)
                setReaderOpen(true)
              }}
              className="cw-btn cw-btn--ghost justify-start"
            >
              <BookOpen strokeWidth={1.5} aria-hidden="true" />
              Reader view
            </button>
            <button
              type="button"
              onClick={() => {
                setPanelOpen(false)
                setSummaryOpen(true)
              }}
              className="cw-btn cw-btn--ghost justify-start"
            >
              <Sparkles strokeWidth={1.5} aria-hidden="true" />
              Summary
            </button>
            {view === 'inbox' ? (
              <button type="button" disabled={pending} onClick={archiveOrRestore} className="cw-btn cw-btn--ghost justify-start">
                <Archive strokeWidth={1.5} aria-hidden="true" />
                Archive
              </button>
            ) : (
              <button type="button" disabled={pending} onClick={archiveOrRestore} className="cw-btn cw-btn--ghost justify-start">
                <ArchiveRestore strokeWidth={1.5} aria-hidden="true" />
                Move to Inbox
              </button>
            )}
            {view === 'inbox' && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setPanelOpen(false)
                  setHideWordOpen(true)
                }}
                className="cw-btn cw-btn--ghost justify-start"
              >
                <EyeOff strokeWidth={1.5} aria-hidden="true" />
                Hide stories with a word
              </button>
            )}
          </div>

          <div className="space-y-1 border-t border-border pt-3">
            <p className="text-xs text-muted">Save to</p>
            {folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                disabled={pending}
                onClick={() => saveTo([folder.id])}
                className="cw-btn cw-btn--ghost w-full justify-start"
              >
                <FolderPlus strokeWidth={1.5} aria-hidden="true" />
                {folder.label}
              </button>
            ))}
            <Input
              placeholder="New folder"
              aria-label="New folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createFolderAndSave()
              }}
            />
          </div>

          {extraCount > 0 && (
            <ul className="space-y-2 border-t border-border pt-3">
              {story.sources.slice(1).map((source) => (
                <li key={source.id} className="text-sm">
                  <span className="text-xs text-muted">{source.feedTitle} · </span>
                  {source.link ? (
                    <a
                      href={source.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => void markArticleRead(source.id)}
                      className="underline-offset-4 hover:underline"
                    >
                      {source.title}
                    </a>
                  ) : (
                    source.title
                  )}
                </li>
              ))}
            </ul>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>
      {readerOpen && <ReaderView story={story} onClose={() => setReaderOpen(false)} />}
      {hideWordOpen && (
        <HideWordDialog title={lead.title} storyId={story.id} onClose={() => setHideWordOpen(false)} />
      )}
    </li>
  )
}
