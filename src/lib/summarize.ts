import OpenAI from 'openai'
import { DEFAULT_LANGUAGE, languageLabel } from '@/lib/languages'

const MODEL = 'gpt-5-nano'
const REQUEST_TIMEOUT_MS = 15_000

// Enough of the article for a two-sentence summary to be grounded in what
// it actually says. Beyond this the lede has long since been covered and
// the extra tokens buy nothing.
const BODY_INPUT_MAX_LENGTH = 6000

// Two sentences at ~30 words each, plus slack for a language whose
// tokenizer is less kind than English's.
const MAX_OUTPUT_TOKENS = 200

// The one summary Parable generates. It runs at ingest against the
// article's extracted body (or, when extraction fails, the feed's own
// description), and the result is the only thing about the article's
// content that gets stored — the body is discarded immediately after.
//
// Translation is folded into this same call rather than run as a second
// pass over the output: asking for the summary directly in the target
// language costs one request instead of two and avoids the quality loss of
// translating an already-compressed text. The model reads whatever
// language the body is in regardless.
export async function summarizeToTarget(
  title: string,
  body: string,
  targetLanguage: string = DEFAULT_LANGUAGE
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('summarize: OPENAI_API_KEY not set, skipping summary')
    return null
  }

  const trimmed = body.trim()
  if (!trimmed) return null

  const client = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS })
  const targetName = languageLabel(targetLanguage)

  try {
    const response = await client.responses.create({
      model: MODEL,
      reasoning: { effort: 'minimal' },
      text: { verbosity: 'low' },
      max_output_tokens: MAX_OUTPUT_TOKENS,
      input: [
        {
          role: 'developer',
          content:
            `Summarize the news article in exactly two concise, neutral sentences, ` +
            `written in ${targetName}. The source may be in any language; always ` +
            `answer in ${targetName}. Output only the two sentences — no preamble, ` +
            `labels, or headings.`,
        },
        { role: 'user', content: `Title: ${title}\n\nBody: ${trimmed.slice(0, BODY_INPUT_MAX_LENGTH)}` },
      ],
    })
    return response.output_text?.trim() || null
  } catch (err) {
    console.error('summarize: OpenAI request failed', err)
    return null
  }
}
