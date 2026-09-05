import { createClient, getUser } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'

export interface FilterRule {
  id: string
  keyword: string
  folderId: string
  folderName: string
}

// "If a title contains X, file it in folder Y." Distinct from the
// auto-delete keyword list on the same page, which throws articles away —
// these keep them, and filing an article is what saves it.
export async function listFilterRules(): Promise<FilterRule[]> {
  const user = await getUser()
  if (!user) return []

  const supabase = await createClient()
  const [{ data: rules, error }, { data: folders, error: foldersError }] = await Promise.all([
    supabase
      .from('filter_rules')
      .select('id, keyword, folder_id')
      .eq('user_id', user.id)
      .order('keyword'),
    supabase.from('folders').select('id, name').eq('user_id', user.id),
  ])
  logQueryError('filters/listFilterRules', error)
  logQueryError('filters/listFilterRules (folders)', foldersError)

  const folderNames = new Map((folders ?? []).map((f) => [f.id, f.name as string]))

  // A rule whose folder has been deleted is unreachable — the FK cascades,
  // so this only guards against a read racing a folder delete.
  return (rules ?? []).flatMap((rule) => {
    const folderName = folderNames.get(rule.folder_id)
    if (!folderName) return []
    return [{ id: rule.id, keyword: rule.keyword, folderId: rule.folder_id, folderName }]
  })
}
