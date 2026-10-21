import { createClient, getUser } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'

export interface CategoryRow {
  id: string
  name: string
  position: number
}

// The user's categories in their chosen order.
export async function listCategories(): Promise<CategoryRow[]> {
  const user = await getUser()
  if (!user) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, position')
    .eq('user_id', user.id)
    .order('position')
    .order('created_at')
  logQueryError('categories/listCategories', error)
  return data ?? []
}
