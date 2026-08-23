import OpenAI from 'openai'
import { DEFAULT_LANGUAGE, languageLabel } from '@/lib/languages'

const MODEL = 'gpt-5-nano'
const BODY_INPUT_MAX_LENGTH = 2000
const REQUEST_TIMEOUT_MS = 15_000

export async function summarizeArticle(
  title: string,
  summaryOrBody: string,
  targetLanguage: string = DEFAULT_LANGUAGE
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('summarize: OPENAI_API_KEY not set, skipping AI summary')
    return null
  }

  const client = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS })
  const body = summaryOrBody.slice(0, BODY_INPUT_MAX_LENGTH)
  const targetName = languageLabel(targetLanguage)

  try {
    const response = await client.responses.create({
      model: MODEL,
      reasoning: { effort: 'minimal' },
      text: { verbosity: 'low' },
      max_output_tokens: 200,
      input: [
        {
          role: 'developer',
          content: `Summarize the news article in 1-3 concise, neutral sentences in ${targetName}. Output only the summary, no preamble or labels.`,
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
