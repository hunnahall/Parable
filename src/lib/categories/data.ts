import { createClient } from '@/lib/supabase/server'

export async function listCategories(): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('categories').select('name').order('name')
  return (data ?? []).map((row) => row.name)
}
