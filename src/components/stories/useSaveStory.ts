'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Story } from '@/lib/stories/data'
import { addFolder } from '@/lib/folders/actions'
import type { FolderOption } from './StoryRow'
import { saveStory } from './saveStory'

// Saving a story into folders, shared by the story row and the reading
// pane: the folder picker's state, "create a folder and save into it", and
// the pending and error state the caller's buttons follow.
export function useSaveStory({
  story,
  onSaved,
  onFolderCreated,
}: {
  story: Story
  onSaved: (story: Story) => void
  onFolderCreated: (folder: FolderOption) => void
}) {
  const router = useRouter()
  const [addingFolder, setAddingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Resolves true once saved, so a caller can close its panel.
  async function saveTo(folderIds: string[]): Promise<boolean> {
    if (folderIds.length === 0) return false
    setPending(true)
    setError(null)
    const saveError = await saveStory(story, folderIds)
    setPending(false)
    if (saveError) {
      setError(saveError)
      return false
    }
    onSaved(story)
    router.refresh()
    return true
  }

  async function createFolderAndSave(): Promise<boolean> {
    const name = newFolderName.trim()
    setNewFolderName('')
    setAddingFolder(false)
    if (!name) return false
    const result = await addFolder({ name, parentId: null })
    if (result.error || !result.id) {
      setError(result.error ?? 'Folder not created')
      return false
    }
    onFolderCreated({ id: result.id, label: name })
    return saveTo([result.id])
  }

  return {
    pending,
    error,
    saveTo,
    createFolderAndSave,
    newFolderName,
    setNewFolderName,
    // Spread onto ArticleFolderPicker.
    pickerProps: {
      onChange: (folderIds: string[]) => void saveTo(folderIds),
      addingFolder,
      setAddingFolder,
      newFolderName,
      setNewFolderName,
      onCreateFolder: () => void createFolderAndSave(),
      disabled: pending,
    },
  }
}
