import type { NextRequest } from 'next/server'
import { loadArticle } from '@/lib/ondemand/article'
import { recordAiUsage, streamText, textResponse } from '@/lib/ondemand/stream'
import { summaryInput, summaryInstructions } from '@/lib/summarize'
import { adminClient } from '@/lib/supabase/admin'
import { languageLabel, DEFAULT_LANGUAGE } from '@/lib/languages'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// Two sentences plus gpt-5-nano's reasoning floor; see summarize.ts.
const MAX_OUTPUT_TOKENS = 200

// The two-sentence summary, written the first time anyone asks and stored
// on the shared article, so it's paid for once. Streams as plain text.
// X-Text-Kind tells the reader view what it was written from.
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/articles/[id]/summary'>) {
  const { id } = await ctx.params
  const article = await loadArticle(id)
  if (!article) return new Response('Not found', { status: 404 })

  const headers = { 'X-Text-Kind': article.kind }
  if (article.summary) return textResponse(article.summary, headers)
  if (!article.text.trim()) return textResponse('', headers)

  const body = streamText(
    {
      instructions: summaryInstructions(languageLabel(DEFAULT_LANGUAGE)),
      input: summaryInput(article.title, article.text),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
    async (outcome) => {
      await recordAiUsage({
        userId: article.userId,
        feedItemId: article.id,
        kind: 'summary',
        usage: outcome.usage,
        firstTextMs: outcome.firstTextMs,
      })
      if (!outcome.complete) return
      const { error } = await adminClient()
        .from('feed_items')
        .update({ summary_ai: outcome.text })
        .eq('id', article.id)
        .is('summary_ai', null)
      if (error) console.error('summary: failed to store', error.message)
    }
  )
  return textResponse(body, headers)
}
