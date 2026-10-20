'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { performFullReset } from '@/lib/settings/actions'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Input'

const CONFIRM_PHRASE = 'RESET'

export default function CleanSlateDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const [confirmText, setConfirmText] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canConfirm = confirmText.trim().toUpperCase() === CONFIRM_PHRASE

  async function handleConfirm() {
    setPending(true)
    setError(null)
    const result = await performFullReset()
    if (result.error) {
      setPending(false)
      setError(result.error)
      return
    }
    // Preferences reset with everything else, and the root layout reads
    // them, so this needs the full refresh.
    router.push('/')
    router.refresh()
  }

  return (
    <Modal
      open
      onClose={() => !pending && onClose()}
      title="Delete everything in your account?"
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="danger-solid" onClick={handleConfirm} disabled={pending || !canConfirm}>
            {pending ? 'Deleting' : 'Delete everything'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p>
          This permanently deletes your subscriptions, saved articles, folders, notes, filters and
          preferences. Your account stays, empty. It can&rsquo;t be undone.
        </p>
        <Field
          label={
            <>
              Type <span className="font-mono">{CONFIRM_PHRASE}</span> to confirm
            </>
          }
          htmlFor="clean-slate-confirm"
          error={error}
        >
          <Input
            id="clean-slate-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
          />
        </Field>
      </div>
    </Modal>
  )
}
