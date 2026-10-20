'use client'

import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

// The retention rules: reference material read once, so it lives behind
// the Help button rather than taking page space.
export default function RulebookDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      title="How long do articles stay?"
      footer={
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <ul className="list-disc space-y-1 pl-5">
        <li>Articles you haven&rsquo;t touched leave the Inbox 12 hours after they arrive.</li>
        <li>Archived articles are deleted 24 hours after you archive them.</li>
        <li>Saved articles stay until you delete them.</li>
      </ul>
    </Modal>
  )
}
