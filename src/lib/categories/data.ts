import { createClient } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'

export async function listCategories(): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('categories').select('name').order('name')
  logQueryError('categories/listCategories', error)
  return (data ?? []).map((row) => row.name)
}
