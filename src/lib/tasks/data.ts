import { createClient, getUser } from '@/lib/supabase/server'
import { logQueryError } from '@/lib/supabase/logError'

export interface TaskRow {
  id: string
  title: string
  done: boolean
  created_at: string
}

export async function listTasks(): Promise<TaskRow[]> {
  const user = await getUser()
  if (!user) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, done, created_at')
    .eq('user_id', user.id)
    .order('done', { ascending: true })
    .order('created_at', { ascending: false })
  logQueryError('tasks/listTasks', error)
  return data ?? []
}
