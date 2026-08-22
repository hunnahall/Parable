import sanitizeHtml from 'sanitize-html'
import he from 'he'
import { franc } from 'franc'
import langs from 'langs'
import OpenAI from 'openai'

const MODEL = 'gpt-5-nano'
const REQUEST_TIMEOUT_MS = 15_000
const SUMMARY_MAX_LENGTH = 500
// Full-article bodies are far longer than a title/summary — capped well
// under gpt-5-nano's context window to keep translate-on-open latency and
// cost bounded for a single reading-view request.
const BODY_MAX_LENGTH = 12_000

export interface TranslatedArticle {
  original_language: string
  title_en: string | null
  summary_en: string | null
}

// franc mostly returns 639-3 codes that `langs` can map straight to a
// 639-1 code. The exception is macrolanguages: franc identifies the
// specific variant it detected (e.g. Mandarin as "cmn", Modern Standard
// Arabic as "arb"), but `langs`'s 639-3 index is keyed on the
// macrolanguage code itself ("zho", "ara") and doesn't know about its
// members. This list is only the gaps that are common in real feed
// content — it is not exhaustive. Anything not covered here just falls
// back to storing franc's raw 3-letter code, which is a little unusual
// to see in a "two-letter" column but never wrong.
const MACROLANGUAGE_OVERRIDES: Record<string, string> = {
  cmn: 'zh', // Mandarin Chinese -> Chinese
  yue: 'zh', // Cantonese -> Chinese
  arb: 'ar', // Modern Standard Arabic -> Arabic
  pes: 'fa', // Iranian Persian -> Persian
  zsm: 'ms', // Standard Malay -> Malay
  swh: 'sw', // Swahili (individual) -> Swahili
}

function toTwoLetterCode(iso6393: string): string {
  if (MACROLANGUAGE_OVERRIDES[iso6393]) {
    return MACROLANGUAGE_OVERRIDES[iso6393]
  }
  const entry = langs.where('3', iso6393)
  return entry?.['1'] || iso6393
}

// Exported so callers that persist the original-language title/summary
// (e.g. the ingest route) can clean text with the exact same rules used
// for detection/translation, instead of re-implementing HTML stripping.
export function stripHtml(html: string): string {
  // sanitize-html discards tags without inserting whitespace, so
  // "<p>A</p><p>B</p>" becomes "AB" instead of "A B". Since most feed
  // summaries are wrapped in <p>/<br>, that would run words together
  // and corrupt both language detection and translation. Insert a
  // space at common block/line-break boundaries before stripping.
  const withBreaks = html
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')

  const withoutTags = sanitizeHtml(withBreaks, {
    allowedTags: [],
    allowedAttributes: {},
  })

  // sanitize-html's output is still valid HTML text — it re-escapes "&"
  // back to "&amp;" rather than decoding it, since its job is HTML-to-HTML
  // (a safe subset), not HTML-to-plain-text. RSS titles/summaries are full
  // of entities (&amp;, &quot;, &#8217; curly quotes, &nbsp;), so without an
  // explicit decode step they'd leak into storage, language detection, and
  // translation as literal entity text instead of the characters they
  // represent.
  return he
    .decode(withoutTags)
    .replace(/\s+/g, ' ')
    .trim()
}

async function translateToEnglish(
  texts: [string, string]
): Promise<[string | null, string | null] | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('translate: OPENAI_API_KEY not set, skipping translation')
    return null
  }

  const [title, summary] = texts
  const client = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS })

  try {
    const response = await client.responses.create({
      model: MODEL,
      // Deliberately not passing a source language: we already have a
      // locally-detected one for storage, but the model's own detection
      // is more reliable for the actual translation than trusting our
      // franc/langs code to be one it recognizes as a source language.
      reasoning: { effort: 'minimal' },
      text: {
        verbosity: 'low',
        format: {
          type: 'json_schema',
          name: 'translation',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              summary: { type: 'string' },
            },
            required: ['title', 'summary'],
            additionalProperties: false,
          },
        },
      },
      max_output_tokens: 500,
      input: [
        {
          role: 'developer',
          content:
            'Translate the article title and summary into English. Preserve meaning and tone; do not add commentary or labels. If a field is already in English, return it unchanged.',
        },
        { role: 'user', content: `Title: ${title}\n\nSummary: ${summary}` },
      ],
    })

    const text = response.output_text
    if (!text) {
      console.error('translate: OpenAI returned no output text')
      return null
    }

    const parsed: { title?: string; summary?: string } = JSON.parse(text)
    return [parsed.title ?? null, parsed.summary ?? null]
  } catch (err) {
    console.error('translate: OpenAI request failed', err)
    return null
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Wraps each line of plain translated text in its own <p> so the result
// renders with the same paragraph structure as the extracted original,
// without asking the model to preserve/re-emit HTML markup.
function textToParagraphHtml(text: string): string {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('')
}

// Translate-on-open: a separate path from translateArticle's ingest-time
// title/summary translation (which is unaffected by this). Only runs when
// a user actually opens a non-English article's reading view (see
// src/app/articles/[id]/page.tsx), operating on Readability's extracted
// plain text rather than the raw HTML — simpler and cheaper than asking
// the model to preserve markup, and textToParagraphHtml above restores
// enough structure for a readable result.
export async function translateFullContent(text: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('translate: OPENAI_API_KEY not set, skipping full-content translation')
    return null
  }

  const truncated = text.slice(0, BODY_MAX_LENGTH)
  const client = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS })

  try {
    const response = await client.responses.create({
      model: MODEL,
      reasoning: { effort: 'minimal' },
      text: { verbosity: 'low' },
      max_output_tokens: 4000,
      input: [
        {
          role: 'developer',
          content:
            'Translate the following article body into English. Preserve paragraph breaks (blank lines between paragraphs). Do not add commentary, labels, or a preamble — output only the translated text.',
        },
        { role: 'user', content: truncated },
      ],
    })

    const translated = response.output_text
    if (!translated) {
      console.error('translate: OpenAI returned no output text for full content')
      return null
    }

    return textToParagraphHtml(translated)
  } catch (err) {
    console.error('translate: full-content OpenAI request failed', err)
    return null
  }
}

export async function translateArticle(
  rawTitle: string,
  rawSummary: string
): Promise<TranslatedArticle> {
  const title = stripHtml(rawTitle)
  const summary = stripHtml(rawSummary)

  const detected = franc(`${title} ${summary}`.trim())
  const original_language =
    detected === 'und' ? 'und' : toTwoLetterCode(detected)

  if (original_language === 'en' || detected === 'und') {
    return { original_language, title_en: null, summary_en: null }
  }

  const truncatedSummary = summary.slice(0, SUMMARY_MAX_LENGTH)

  const translated = await translateToEnglish([title, truncatedSummary])

  if (!translated) {
    return { original_language, title_en: null, summary_en: null }
  }

  const [title_en, summary_en] = translated
  return { original_language, title_en, summary_en }
}
