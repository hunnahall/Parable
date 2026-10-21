import type { NextRequest } from 'next/server'
import { loadArticle } from '@/lib/ondemand/article'
import { recordAiUsage, streamText, textResponse } from '@/lib/ondemand/stream'
import { needsTranslation } from '@/lib/translate'
import { adminClient } from '@/lib/supabase/admin'
import { DEFAULT_LANGUAGE, languageLabel } from '@/lib/languages'
import { READER_INPUT_MAX_LENGTH, READER_MAX_OUTPUT_TOKENS, readerInstructions } from '@/lib/ondemand/prompts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// The reader view's text: the stored article text, translated into English
// the first time anyone opens it and stored, so it's paid for once. English
// articles get no AI call. Streams as plain text.
//   X-Text-Kind: full, teaser (paywall or bot blocking) or none
//   X-Truncated: 1 when the article was longer than what's shown
export async function GET(_request: NextRequest, ctx: RouteContext<'/api/articles/[id]/reader'>) {
  const { id } = await ctx.params
  const article = await loadArticle(id)
  if (!article) return new Response('Not found', { status: 404 })

  const source = article.text.trim()
  const truncated = source.length > READER_INPUT_MAX_LENGTH
  const headers = { 'X-Text-Kind': article.kind, 'X-Truncated': truncated ? '1' : '0' }

  if (!source) return textResponse('', headers)
  if (article.textEn) return textResponse(article.textEn, headers)
  if (!needsTranslation(article.originalLanguage ?? 'und', DEFAULT_LANGUAGE)) {
    return textResponse(source, { ...headers, 'X-Truncated': '0' })
  }

  const body = streamText(
    {
      instructions: readerInstructions(languageLabel(DEFAULT_LANGUAGE)),
      input: source.slice(0, READER_INPUT_MAX_LENGTH),
      maxOutputTokens: READER_MAX_OUTPUT_TOKENS,
    },
    async (outcome) => {
      await recordAiUsage({
        userId: article.userId,
        feedItemId: article.id,
        kind: 'reader',
        usage: outcome.usage,
        firstTextMs: outcome.firstTextMs,
      })
      if (!outcome.complete) return
      const { error } = await adminClient()
        .from('feed_item_texts')
        .update({ text_en: outcome.text })
        .eq('feed_item_id', article.id)
        .is('text_en', null)
      if (error) console.error('reader: failed to store', error.message)
    }
  )
  return textResponse(body, headers)
}
