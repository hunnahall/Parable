import OpenAI from 'openai'
import { DEFAULT_LANGUAGE, languageLabel } from '@/lib/languages'

const MODEL = 'gpt-5-nano'
const BODY_INPUT_MAX_LENGTH = 2000
const REQUEST_TIMEOUT_MS = 15_000

async function runSummary(
  title: string,
  body: string,
  targetLanguage: string,
  sentenceRange: string,
  maxOutputTokens: number
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('summarize: OPENAI_API_KEY not set, skipping AI summary')
    return null
  }

  const client = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS })
  const targetName = languageLabel(targetLanguage)

  try {
    const response = await client.responses.create({
      model: MODEL,
      reasoning: { effort: 'minimal' },
      text: { verbosity: 'low' },
      max_output_tokens: maxOutputTokens,
      input: [
        {
          role: 'developer',
          content: `Summarize the news article in ${sentenceRange} concise, neutral sentences in ${targetName}. Output only the summary, no preamble or labels.`,
        },
        { role: 'user', content: `Title: ${title}\n\nBody: ${body}` },
      ],
    })
    return response.output_text?.trim() || null
  } catch (err) {
    console.error('summarize: OpenAI request failed', err)
    return null
  }
}

// Ingest-time teaser summary (feed_items.summary_ai), only run per-article
// when the feed's summarize_articles toggle is on. Input is the feed's own
// (short) summary/description, not the full scraped body.
export async function summarizeArticle(
  title: string,
  summaryOrBody: string,
  targetLanguage: string = DEFAULT_LANGUAGE
): Promise<string | null> {
  return runSummary(title, summaryOrBody.slice(0, BODY_INPUT_MAX_LENGTH), targetLanguage, '1-3', 200)
}

// On-demand "Summarize this" in the reading view: run once, only when the
// user explicitly asks, against the full extracted article body — longer
// input allowance and a longer output than the teaser summary above.
const CONTENT_INPUT_MAX_LENGTH = 6000

export async function summarizeArticleContent(
  title: string,
  contentText: string,
  targetLanguage: string = DEFAULT_LANGUAGE
): Promise<string | null> {
  return runSummary(title, contentText.slice(0, CONTENT_INPUT_MAX_LENGTH), targetLanguage, '3-4', 300)
}
