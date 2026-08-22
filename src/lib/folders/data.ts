import { createClient } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'

export interface FolderRow {
  id: string
  name: string
  parentId: string | null
}

export async function listFolders(): Promise<FolderRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('folders').select('id, name, parent_id').order('name')
  logQueryError('folders/listFolders', error)
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, parentId: row.parent_id }))
}

// Same rows as listFolders, but with each option's display label prefixed
// by its ancestor chain (e.g. "Tech / Blogs") so a flat <select> still
// conveys nesting depth without a real tree widget.
export async function listFolderOptions(): Promise<{ id: string; label: string }[]> {
  const folders = await listFolders()
  const byId = new Map(folders.map((f) => [f.id, f]))

  function pathLabel(folder: FolderRow): string {
    const parts: string[] = [folder.name]
    let current = folder
    while (current.parentId) {
      const parent = byId.get(current.parentId)
      if (!parent) break
      parts.unshift(parent.name)
      current = parent
    }
    return parts.join(' / ')
  }

  return folders
    .map((f) => ({ id: f.id, label: pathLabel(f) }))
    .sort((a, b) => a.label.localeCompare(b.label))
}
