'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Archive } from 'lucide-react'
import type { Story } from '@/lib/stories/data'
import { markStoriesSeen } from '@/lib/stories/actions'
import type { CategoryRow } from '@/lib/categories/data'
import { archiveArticlesBulk, unarchiveArticles } from '@/lib/articles/actions'
import StoryRow, { type FolderOption } from './StoryRow'
import Button, { buttonClass } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import EmptyState from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'

export type StoryViewMode = 'inbox' | 'archive'

const EMPTY_COPY: Record<StoryViewMode, { title: string; text: string }> = {
  inbox: {
    title: 'Nothing new',
    text: 'Stories from the last 12 hours show up here as your feeds publish them.',
  },
  archive: {
    title: 'Nothing archived',
    text: 'Archived stories wait here for 24 hours, then go.',
  },
}

interface Section {
  key: string
  title: string | null
  stories: Story[]
}

// The Inbox lists stories under each category, in the user's order. A story
// whose feeds span categories appears in each of them; stories keep the
// server's newest-activity-first order within a section. Without categories
// it's one list. Stories from uncategorized feeds go last.
function sectionsFor(stories: Story[], categories: CategoryRow[]): Section[] {
  if (categories.length === 0) return [{ key: 'all', title: null, stories }]

  const sections: Section[] = categories.map((category) => ({
    key: category.id,
    title: category.name,
    stories: stories.filter((story) => story.sources.some((s) => s.categoryId === category.id)),
  }))
  const known = new Set(categories.map((c) => c.id))
  sections.push({
    key: 'none',
    title: 'No category',
    stories: stories.filter((story) => story.sources.some((s) => !s.categoryId || !known.has(s.categoryId))),
  })
  return sections.filter((section) => section.stories.length > 0)
}

// Seen means on screen long enough to read the title. Compared as times,
// since the strings come from different places (Postgres, the browser).
function isStorySeen(story: Pick<Story, 'seenAt' | 'lastActivityAt'>): boolean {
  return story.seenAt !== null && new Date(story.seenAt) >= new Date(story.lastActivityAt)
}

const ids = (stories: Story[]) => stories.flatMap((story) => story.sources.map((s) => s.id))

// The Inbox and Archive: stories, newest activity first. A story is every
// article about the same thing from the reader's feeds; archiving or saving
// it applies to all of them.
export default function StoryList({
  stories,
  view,
  folders: initialFolders,
  categories = [],
  query,
  basePath,
}: {
  stories: Story[]
  view: StoryViewMode
  folders: FolderOption[]
  categories?: CategoryRow[]
  query: string
  basePath: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [folders, setFolders] = useState(initialFolders)
  const [queryDraft, setQueryDraft] = useState(query)
  const [bulkPending, setBulkPending] = useState(false)
  // Stories seen this visit, keyed to the activity time they were seen at,
  // so a story that gains a source after being seen lights up again.
  const [seenLocally, setSeenLocally] = useState<Map<string, string>>(new Map())
  const pendingSeen = useRef<Set<string>>(new Set())
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const visible = stories.filter((story) => !removed.has(story.id))

  function hide(storyIds: string[]) {
    setRemoved((prev) => new Set([...prev, ...storyIds]))
  }

  function unhide(storyIds: string[]) {
    setRemoved((prev) => new Set([...prev].filter((id) => !storyIds.includes(id))))
  }

  async function archive(targets: Story[]) {
    hide(targets.map((s) => s.id))
    const result = await archiveArticlesBulk(ids(targets))
    if (result.error) {
      unhide(targets.map((s) => s.id))
      toast(`Not archived. ${result.error}`, 'danger')
      return
    }
    toast(targets.length === 1 ? 'Story archived' : `${targets.length} stories archived`, 'default', {
      label: 'Undo',
      onClick: async () => {
        unhide(targets.map((s) => s.id))
        await unarchiveArticles(ids(targets))
        router.refresh()
      },
    })
    router.refresh()
  }

  async function unarchive(story: Story) {
    hide([story.id])
    const result = await unarchiveArticles(ids([story]))
    if (result.error) {
      unhide([story.id])
      toast(`Not moved. ${result.error}`, 'danger')
      return
    }
    toast('Moved to Inbox')
    router.refresh()
  }

  // Archives exactly the stories on screen when pressed. An article that
  // arrives afterwards isn't in this list, so it stays in the Inbox.
  async function archiveAll() {
    setBulkPending(true)
    await archive(visible)
    setBulkPending(false)
  }

  function flushSeen() {
    flushTimer.current = null
    const batch = [...pendingSeen.current]
    pendingSeen.current.clear()
    if (batch.length > 0) void markStoriesSeen(batch)
  }

  const handleSeen = useCallback((story: Story) => {
    setSeenLocally((prev) => new Map(prev).set(story.id, story.lastActivityAt))
    pendingSeen.current.add(story.id)
    flushTimer.current ??= setTimeout(flushSeen, 1500)
  }, [])

  // Send what's queued when leaving the page.
  useEffect(
    () => () => {
      if (flushTimer.current) clearTimeout(flushTimer.current)
      flushSeen()
    },
    []
  )

  function isDimmed(story: Story): boolean {
    if (view !== 'inbox') return false
    return isStorySeen(story) || seenLocally.get(story.id) === story.lastActivityAt
  }

  function commitSearch() {
    const q = queryDraft.trim()
    router.push(q ? `${basePath}?q=${encodeURIComponent(q)}` : basePath)
  }

  return (
    <div className="space-y-4">
      {view === 'archive' && (
        <Input
          type="search"
          placeholder="Search titles"
          aria-label="Search titles"
          value={queryDraft}
          onChange={(e) => setQueryDraft(e.target.value)}
          onBlur={commitSearch}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitSearch()
          }}
        />
      )}

      {view === 'inbox' && visible.length > 0 && (
        <div className="flex items-center justify-end">
          <Button size="sm" disabled={bulkPending} onClick={archiveAll}>
            <Archive strokeWidth={1.5} aria-hidden="true" />
            {bulkPending ? 'Archiving' : 'Archive all'}
          </Button>
        </div>
      )}

      {visible.length === 0 ? (
        query ? (
          <EmptyState title="No matching stories">Try a different search.</EmptyState>
        ) : (
          <EmptyState
            title={EMPTY_COPY[view].title}
            action={
              view === 'inbox' ? (
                <Link href="/feeds" className={buttonClass({ variant: 'primary' })}>
                  Add a feed
                </Link>
              ) : undefined
            }
          >
            {EMPTY_COPY[view].text}
          </EmptyState>
        )
      ) : (
        <div className="space-y-6">
          {sectionsFor(visible, view === 'inbox' ? categories : []).map((section) => (
            <section key={section.key} className="space-y-2">
              {section.title && (
                <h2 className="text-sm font-medium text-muted">
                  {section.title}{' '}
                  <span className="font-mono text-xs tabular-nums">{section.stories.length}</span>
                </h2>
              )}
            <ul className="card-elevated divide-y divide-border">
              {section.stories.map((story) => (
                <StoryRow
                  key={`${section.key}-${story.id}`}
                  story={story}
                  view={view}
                  folders={folders}
                  onFolderCreated={(folder) => setFolders((prev) => [...prev, folder])}
                  onArchive={(s) => archive([s])}
                  onUnarchive={unarchive}
                  onSaved={(s) => {
                    hide([s.id])
                    toast('Story saved')
                  }}
                  dimmed={isDimmed(story)}
                  onSeen={view === 'inbox' ? handleSeen : undefined}
                />
              ))}
            </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
