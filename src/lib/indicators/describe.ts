import OpenAI from 'openai'

const MODEL = 'gpt-5-nano'
const NOTES_INPUT_MAX_LENGTH = 2000
const REQUEST_TIMEOUT_MS = 15_000

export async function describeIndicator(
  displayName: string,
  notes: string | null
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('describeIndicator: OPENAI_API_KEY not set, skipping description')
    return null
  }

  const client = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS })
  const trimmedNotes = notes?.slice(0, NOTES_INPUT_MAX_LENGTH) ?? ''

  try {
    const response = await client.responses.create({
      model: MODEL,
      reasoning: { effort: 'minimal' },
      text: { verbosity: 'low' },
      max_output_tokens: 100,
      input: [
        {
          role: 'developer',
          content:
            'In one concise sentence, explain why this economic indicator matters to a general audience. Output only the sentence, no preamble or labels.',
        },
        {
          role: 'user',
          content: `Indicator: ${displayName}${trimmedNotes ? `\n\nOfficial notes: ${trimmedNotes}` : ''}`,
        },
      ],
    })
    return response.output_text?.trim() || null
  } catch (err) {
    console.error('describeIndicator: OpenAI request failed', err)
    return null
  }
}
