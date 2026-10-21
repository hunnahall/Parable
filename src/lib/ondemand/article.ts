import { createClient, getUser } from '@/lib/supabase/server'

export interface ArticleForReading {
  userId: string
  id: string
  title: string
  titleEn: string | null
  originalLanguage: string | null
  summary: string | null
  text: string
  kind: 'full' | 'teaser' | 'none'
  textEn: string | null
}

// The article and its stored text, read with the reader's own client, so
// RLS decides whether they may see it. Null when they can't.
export async function loadArticle(id: string): Promise<ArticleForReading | null> {
  const user = await getUser()
  if (!user) return null

  const supabase = await createClient()
  const { data: item } = await supabase
    .from('feed_items')
    .select('id, title, title_en, original_language, summary_ai')
    .eq('id', id)
    .maybeSingle()
  if (!item) return null

  const { data: stored } = await supabase
    .from('feed_item_texts')
    .select('text, kind, text_en')
    .eq('feed_item_id', id)
    .maybeSingle()

  return {
    userId: user.id,
    id: item.id,
    title: item.title,
    titleEn: item.title_en,
    originalLanguage: item.original_language,
    summary: item.summary_ai,
    text: stored?.text ?? '',
    kind: (stored?.kind as ArticleForReading['kind'] | undefined) ?? 'none',
    textEn: stored?.text_en ?? null,
  }
}
