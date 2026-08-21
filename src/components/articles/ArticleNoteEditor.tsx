'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setArticleNote } from '@/lib/articles/actions'

// Calls onChange immediately so the caller's list updates in the same tick
// as the keystroke, instead of waiting on the round trip below. See
// ArticleList.tsx for why gating visible state on that round trip made
// edits feel multi-second slow.
export default function ArticleNoteEditor({
  itemId,
  note,
  onChange,
}: {
  itemId: string
  note: string | null
  onChange: (note: string | null) => void
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(note ?? '')

  async function commit() {
    setEditing(false)
    const trimmed = value.trim()
    if (trimmed === (note ?? '')) return
    onChange(trimmed || null)
    await setArticleNote(itemId, value)
    router.refresh()
  }

  if (editing) {
    return (
      <input
        type="text"
        autoFocus
        value={value}
        placeholder="Add a note…"
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setValue(note ?? '')
            setEditing(false)
          }
        }}
        className="w-full border border-border rounded px-1.5 py-0.5 text-xs bg-background mt-1"
      />
    )
  }

  return note ? (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="block text-left text-xs italic text-muted hover:text-foreground transition-colors mt-1"
    >
      {note}
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-xs text-muted hover:text-foreground transition-colors mt-1"
    >
      + Note
    </button>
  )
}
