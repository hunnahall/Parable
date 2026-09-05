import OpenAI from 'openai'
import { DEFAULT_LANGUAGE, languageLabel } from '@/lib/languages'

const MODEL = 'gpt-5-nano'
const REQUEST_TIMEOUT_MS = 15_000

// News is inverted-pyramid: a two-sentence summary is written almost
// entirely from the lede and the paragraph or two after it. This is the
// single largest input-token line in the whole pipeline, and it is worse
// for non-English sources — the same character count is ~2x the tokens in
// Arabic, Chinese or Russian as it is in English — so it is the first
// place to cut. Lowered from 6000, where the extra characters were paid for
// on every article and reached the model long after the summary's content
// had been decided.
const BODY_INPUT_MAX_LENGTH = 2500

// Two sentences at ~30 words each is ~80 tokens, plus the reasoning tokens
// gpt-5-nano bills even at effort: 'minimal', which count against this same
// ceiling. Output is 8x the price of input on this model, so the headroom
// here is worth keeping tight — but not so tight that responses truncate,
// which is what the `incomplete` check below exists to catch.
const MAX_OUTPUT_TOKENS = 140

// One client for the process rather than one per call — see the same note
// in translate.ts.
let client: OpenAI | null = null
function openai(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  if (!client) client = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS })
  return client
}

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
  const api = openai()
  if (!api) {
    console.error('summarize: OPENAI_API_KEY not set, skipping summary')
    return null
  }

  const trimmed = body.trim()
  if (!trimmed) return null

  const targetName = languageLabel(targetLanguage)

  try {
    const response = await api.responses.create({
      model: MODEL,
      reasoning: { effort: 'minimal' },
      text: { verbosity: 'low' },
      max_output_tokens: MAX_OUTPUT_TOKENS,
      input: [
        {
          role: 'developer',
          content:
            `Summarize the news article in exactly two concise, neutral sentences ` +
            `of at most 30 words each, written in ${targetName}. The source may be ` +
            `in any language; always answer in ${targetName}. Output only the two ` +
            `sentences — no preamble, labels, or headings.`,
        },
        { role: 'user', content: `Title: ${title}\n\nBody: ${trimmed.slice(0, BODY_INPUT_MAX_LENGTH)}` },
      ],
    })

    // max_output_tokens counts reasoning tokens as well as visible ones, so
    // a response can stop mid-sentence. Storing that would put half a
    // sentence in the Inbox permanently — the body is gone by then, so
    // there is no second chance to summarize. Treat it as a failure and
    // fall back to no summary instead.
    if (response.status === 'incomplete') {
      console.error(
        `summarize: response truncated (${response.incomplete_details?.reason ?? 'unknown'})`
      )
      return null
    }

    return response.output_text?.trim() || null
  } catch (err) {
    console.error('summarize: OpenAI request failed', err)
    return null
  }
}
