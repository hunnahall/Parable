'use client'

import type { StorySource } from '@/lib/stories/data'

// "Switch source" for a grouped story: the summary and reader view start on
// the newest source, and this picks another. Hidden for a single source.
export default function SourcePicker({
  sources,
  value,
  onChange,
  id,
}: {
  sources: StorySource[]
  value: string
  onChange: (id: string) => void
  id: string
}) {
  if (sources.length < 2) return null
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-xs text-muted">
      Switch source
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cw-select max-w-[16rem] py-0.5 text-xs"
      >
        {sources.map((source) => (
          <option key={source.id} value={source.id}>
            {source.feedTitle ?? 'Unknown feed'}
          </option>
        ))}
      </select>
    </label>
  )
}
