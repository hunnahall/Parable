'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { hideStoriesWithWord } from '@/lib/filters/actions'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'

// The title's words, once each, in order. Letters and digits in any script;
// one-letter words are left out since they'd filter almost everything.
function wordsOf(title: string): string[] {
  const seen = new Set<string>()
  const words: string[] = []
  for (const raw of title.split(/[^\p{L}\p{N}'’-]+/u)) {
    const word = raw.replace(/^['’-]+|['’-]+$/g, '')
    const key = word.toLowerCase()
    if (word.length < 2 || seen.has(key)) continue
    seen.add(key)
    words.push(word)
  }
  return words
}

// "Hide stories with this word": pick a word from the title (or type a
// phrase) and it becomes a filter, applied to the Inbox at once.
export default function HideWordDialog({
  title,
  storyId,
  onClose,
}: {
  title: string
  storyId: string
  onClose: () => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [phrase, setPhrase] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function hide(word: string) {
    setPending(true)
    setError(null)
    const result = await hideStoriesWithWord(word)
    setPending(false)
    if (result.error) {
      setError(result.error)
      return
    }
    onClose()
    toast(
      result.hiddenCount === 0
        ? `Filtering “${word.trim()}” from now on`
        : `Filtering “${word.trim()}”. ${result.hiddenCount} article${result.hiddenCount === 1 ? '' : 's'} hidden`
    )
    router.refresh()
  }

  return (
    <Modal
      open
      onClose={() => !pending && onClose()}
      title="Hide stories with which word?"
      labelledBy={`hide-word-${storyId}`}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Stories whose English title has this word leave your Inbox now and stop arriving. You can remove it on the
          Filters page.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {wordsOf(title).map((word) => (
            <Button key={word} size="sm" disabled={pending} onClick={() => hide(word)}>
              {word}
            </Button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (phrase.trim()) void hide(phrase)
          }}
          className="flex items-end gap-2"
        >
          <div className="min-w-0 flex-1">
          <Field label="Or a phrase" htmlFor={`hide-phrase-${storyId}`} error={error}>
            <Input
              id={`hide-phrase-${storyId}`}
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder="prime minister"
            />
          </Field>
          </div>
          <Button type="submit" variant="primary" disabled={pending || !phrase.trim()}>
            {pending ? 'Hiding' : 'Hide'}
          </Button>
        </form>
      </div>
    </Modal>
  )
}
