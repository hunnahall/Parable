'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { setArticleTags } from '@/lib/articles/actions'

// Calls onChange immediately so the caller's list updates in the same tick
// as the click, instead of waiting on the round trip below. See
// ArticleList.tsx for why gating visible state on that round trip made
// edits feel multi-second slow.
export default function ArticleTagEditor({
  itemId,
  tags,
  onChange,
}: {
  itemId: string
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState('')

  async function addTag() {
    const trimmed = value.trim()
    setValue('')
    setAdding(false)
    if (!trimmed || tags.includes(trimmed)) return
    const next = [...tags, trimmed]
    onChange(next)
    await setArticleTags(itemId, next)
    router.refresh()
  }

  async function removeTag(tag: string) {
    const next = tags.filter((t) => t !== tag)
    onChange(next)
    await setArticleTags(itemId, next)
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 text-xs bg-foreground/5 text-muted px-2 py-0.5"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="hover:text-danger transition-colors"
            aria-label={`Remove tag ${tag}`}
          >
            <X size={12} strokeWidth={1.75} />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          type="text"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={addTag}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setValue('')
              setAdding(false)
            }
          }}
          placeholder="tag…"
          className="w-16 border border-border px-2 py-0.5 text-xs bg-background"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-xs text-muted hover:text-accent transition-colors"
        >
          + tag
        </button>
      )}
    </div>
  )
}
