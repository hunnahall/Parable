'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, X } from 'lucide-react'
import type { FilterRule } from '@/lib/filters/rules'
import { addFilterRule, removeFilterRule, runFilterRulesNow } from '@/lib/filters/actions'
import { addFolder } from '@/lib/folders/actions'
import { useToast } from '@/components/ui/Toast'
import Button from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Input'

const NEW_FOLDER_OPTION = '__new_folder__'

// "If a title contains X, file it in Y." The sibling of the keyword
// blocklist above it on this page: that one throws articles away, this one
// keeps them and files them, which is also what saves them.
export default function RulesBlock({
  rules,
  folders,
}: {
  rules: FilterRule[]
  folders: { id: string; label: string }[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [keyword, setKeyword] = useState('')
  const [folderId, setFolderId] = useState('')
  const [newFolderName, setNewFolderName] = useState('')
  const [addingFolder, setAddingFolder] = useState(false)
  const [pending, setPending] = useState(false)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<string | null>(null)

  async function handleAdd() {
    const trimmed = keyword.trim()
    if (!trimmed) return

    setPending(true)
    setRunResult(null)

    // A rule needs a folder to point at, so creating one inline is part of
    // adding the rule rather than a separate trip to the Feeds page.
    let targetFolderId = folderId
    if (addingFolder) {
      const name = newFolderName.trim()
      if (!name) {
        setPending(false)
        return
      }
      const created = await addFolder({ name, parentId: null })
      if (created.error || !created.id) {
        setPending(false)
        toast(created.error ?? 'Failed to create folder', 'danger')
        return
      }
      targetFolderId = created.id
      setNewFolderName('')
      setAddingFolder(false)
    }

    const result = await addFilterRule(trimmed, targetFolderId)
    setPending(false)
    if (result.error) {
      toast(result.error, 'danger')
      return
    }
    setKeyword('')
    router.refresh()
  }

  async function handleRemove(id: string) {
    setPending(true)
    setRunResult(null)
    const result = await removeFilterRule(id)
    setPending(false)
    if (result.error) {
      toast(result.error, 'danger')
      return
    }
    router.refresh()
  }

  async function handleRunNow() {
    setRunning(true)
    setRunResult(null)
    const result = await runFilterRulesNow()
    setRunning(false)
    if (result.error) {
      setRunResult(result.error)
      return
    }
    setRunResult(
      result.filedCount === 0
        ? 'No matching articles found.'
        : `Filed ${result.filedCount} article${result.filedCount === 1 ? '' : 's'}.`
    )
    router.refresh()
  }

  return (
    <div className="card-elevated space-y-2 p-4">
      <h2 className="text-lg font-bold">Rules</h2>
      <p className="text-base text-muted">
        New articles whose title contains a word are filed into a folder automatically — which
        also saves them. Filters run first, so a title matching both is deleted rather than filed.
      </p>

      {rules.length > 0 && (
        <ul className="divide-y divide-border-subtle">
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-center gap-2 py-1.5 text-base">
              <span className="truncate font-medium">{rule.keyword}</span>
              <ArrowRight size={13} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-muted" />
              <span className="truncate text-accent">{rule.folderName}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => handleRemove(rule.id)}
                aria-label={`Remove rule ${rule.keyword} to ${rule.folderName}`}
                className="ml-auto shrink-0 text-muted transition-colors hover:text-danger disabled:opacity-50"
              >
                <X size={13} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void handleAdd()
            }
          }}
          placeholder="e.g. earnings"
          aria-label="Word to match"
          className="min-w-[8rem] flex-1"
        />
        <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-muted" />
        {addingFolder ? (
          <Input
            type="text"
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setNewFolderName('')
                setAddingFolder(false)
              }
            }}
            placeholder="New folder…"
            aria-label="New folder name"
            className="min-w-[8rem] flex-1"
          />
        ) : (
          <Select
            value={folderId}
            aria-label="Folder"
            onChange={(e) => {
              if (e.target.value === NEW_FOLDER_OPTION) {
                setAddingFolder(true)
                return
              }
              setFolderId(e.target.value)
            }}
            className="min-w-[8rem] flex-1"
          >
            <option value="">Pick a folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
            <option value={NEW_FOLDER_OPTION}>+ New folder</option>
          </Select>
        )}
        <Button
          onClick={handleAdd}
          disabled={pending || !keyword.trim() || (!addingFolder && !folderId)}
        >
          Add
        </Button>
      </div>

      <div>
        <Button onClick={handleRunNow} disabled={running || rules.length === 0}>
          {running ? 'Running…' : 'Run rules now'}
        </Button>
        <p className="mt-1 text-base text-muted">
          Files any article currently in your Inbox whose title matches one of these rules. Saved
          and archived articles are left alone.
        </p>
        {runResult && <p className="mt-1 text-base text-muted">{runResult}</p>}
      </div>
    </div>
  )
}
