'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Segmented from '@/components/ui/Segmented'
import { updatePreferences } from '@/lib/preferences/actions'
import type { InboxView } from '@/lib/preferences/data'

const OPTIONS: { value: InboxView; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'front', label: 'Front page' },
]

// List or Front page, saved to user_preferences.inbox_view. Only shown at
// 1000px and up; narrower screens always get the list.
export default function InboxViewSwitch({ initial }: { initial: InboxView }) {
  const router = useRouter()
  const [view, setView] = useState(initial)

  async function choose(next: InboxView) {
    setView(next)
    await updatePreferences({ inboxView: next })
    router.refresh()
  }

  return (
    <div className="max-[999px]:hidden">
      <Segmented options={OPTIONS} value={view} onChange={(next) => void choose(next)} label="Inbox layout" />
    </div>
  )
}
