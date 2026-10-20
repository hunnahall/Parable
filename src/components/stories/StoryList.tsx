'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Story } from '@/lib/stories/data'
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

const ids = (stories: Story[]) => stories.flatMap((story) => story.sources.map((s) => s.id))

// The Inbox and Archive: stories, newest activity first. A story is every
// article about the same thing from the reader's feeds; archiving or saving
// it applies to all of them.
export default function StoryList({
  stories,
  view,
  folders: initialFolders,
  query,
  basePath,
}: {
  stories: Story[]
  view: StoryViewMode
  folders: FolderOption[]
  query: string
  basePath: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const [folders, setFolders] = useState(initialFolders)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [queryDraft, setQueryDraft] = useState(query)
  const [bulkPending, setBulkPending] = useState(false)

  const visible = stories.filter((story) => !removed.has(story.id))

  function hide(storyIds: string[]) {
    setRemoved((prev) => new Set([...prev, ...storyIds]))
    setSelected((prev) => new Set([...prev].filter((id) => !storyIds.includes(id))))
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

  async function archiveSelected() {
    setBulkPending(true)
    await archive(visible.filter((story) => selected.has(story.id)))
    setBulkPending(false)
  }

  function commitSearch() {
    const q = queryDraft.trim()
    router.push(q ? `${basePath}?q=${encodeURIComponent(q)}` : basePath)
  }

  const allSelected = visible.length > 0 && selected.size === visible.length

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
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="cw-check">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = selected.size > 0 && !allSelected
              }}
              onChange={() => setSelected(allSelected ? new Set() : new Set(visible.map((s) => s.id)))}
            />
            <span className="text-muted tabular-nums">
              {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
            </span>
          </label>
          {selected.size > 0 && (
            <Button size="sm" disabled={bulkPending} onClick={archiveSelected}>
              {bulkPending ? 'Archiving' : 'Archive selected'}
            </Button>
          )}
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
        <ul className="card-elevated divide-y divide-border">
          {visible.map((story) => (
            <StoryRow
              key={story.id}
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
              selected={view === 'inbox' ? selected.has(story.id) : undefined}
              onToggleSelect={
                view === 'inbox'
                  ? (id) =>
                      setSelected((prev) => {
                        const next = new Set(prev)
                        if (next.has(id)) next.delete(id)
                        else next.add(id)
                        return next
                      })
                  : undefined
              }
            />
          ))}
        </ul>
      )}
    </div>
  )
}
