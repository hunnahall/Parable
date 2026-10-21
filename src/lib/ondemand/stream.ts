import OpenAI from 'openai'
import { usageOf, EMPTY_USAGE, type TokenUsage } from '@/lib/usage/tokens'
import { adminClient } from '@/lib/supabase/admin'

const MODEL = 'gpt-5-nano'
const REQUEST_TIMEOUT_MS = 60_000

let client: OpenAI | null = null
function openai(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  if (!client) client = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS })
  return client
}

export interface StreamOutcome {
  text: string
  // False when the model stopped early (token limit) or the call failed:
  // the reader still sees what arrived, but nothing is stored.
  complete: boolean
  usage: TokenUsage
  // Milliseconds from the request to the first visible text, for the
  // 2-second target in context.md.
  firstTextMs: number | null
}

// One streamed OpenAI call, as a plain-text HTTP body. Text goes to the
// reader as it arrives; onDone runs once the stream ends, with everything
// that was sent, so the caller can store it.
export function streamText(
  options: { instructions: string; input: string; maxOutputTokens: number },
  onDone: (outcome: StreamOutcome) => Promise<void>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      const startedAt = Date.now()
      let text = ''
      let firstTextMs: number | null = null
      let complete = false
      let usage = EMPTY_USAGE

      const api = openai()
      if (!api) {
        controller.enqueue(encoder.encode('The AI service is not configured.'))
        controller.close()
        return
      }

      try {
        const stream = await api.responses.create({
          model: MODEL,
          reasoning: { effort: 'minimal' },
          text: { verbosity: 'low' },
          max_output_tokens: options.maxOutputTokens,
          instructions: options.instructions,
          input: options.input,
          stream: true,
        })
        for await (const event of stream) {
          if (event.type === 'response.output_text.delta') {
            firstTextMs ??= Date.now() - startedAt
            text += event.delta
            controller.enqueue(encoder.encode(event.delta))
          } else if (event.type === 'response.completed') {
            usage = usageOf(event.response.usage)
            complete = true
          } else if (event.type === 'response.incomplete' || event.type === 'response.failed') {
            usage = usageOf(event.response.usage)
          }
        }
      } catch (err) {
        console.error('ondemand: OpenAI stream failed', err)
        if (!text) controller.enqueue(encoder.encode('Something went wrong. Try again.'))
      }

      controller.close()
      try {
        await onDone({ text: text.trim(), complete: complete && text.trim().length > 0, usage, firstTextMs })
      } catch (err) {
        console.error('ondemand: saving the result failed', err)
      }
    },
  })
}

// Every on-demand call is recorded, billed or not, so the Usage box counts
// it. Best-effort.
export async function recordAiUsage(row: {
  userId: string
  feedItemId: string
  kind: 'summary' | 'reader'
  usage: TokenUsage
  firstTextMs: number | null
}): Promise<void> {
  const { error } = await adminClient().from('ai_usage').insert({
    user_id: row.userId,
    feed_item_id: row.feedItemId,
    kind: row.kind,
    input_tokens: row.usage.inputTokens,
    output_tokens: row.usage.outputTokens,
    reasoning_tokens: row.usage.reasoningTokens,
    first_text_ms: row.firstTextMs,
  })
  if (error) console.error('ondemand: failed to record usage', error.message)
}

export function textResponse(body: ReadableStream<Uint8Array> | string, headers: Record<string, string> = {}) {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  })
}
