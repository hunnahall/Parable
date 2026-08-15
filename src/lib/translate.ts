import sanitizeHtml from 'sanitize-html'
import { franc } from 'franc'
import langs from 'langs'

const AZURE_TRANSLATE_ENDPOINT =
  'https://api.cognitive.microsofttranslator.com/translate'
const SUMMARY_MAX_LENGTH = 500

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

function stripHtml(html: string): string {
  // sanitize-html discards tags without inserting whitespace, so
  // "<p>A</p><p>B</p>" becomes "AB" instead of "A B". Since most feed
  // summaries are wrapped in <p>/<br>, that would run words together
  // and corrupt both language detection and translation. Insert a
  // space at common block/line-break boundaries before stripping.
  const withBreaks = html
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')

  return sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim()
}

async function translateToEnglish(
  texts: [string, string]
): Promise<[string | null, string | null] | null> {
  const key = process.env.AZURE_TRANSLATOR_KEY
  const region = process.env.AZURE_TRANSLATOR_REGION

  if (!key || !region) {
    console.error(
      'translate: AZURE_TRANSLATOR_KEY / AZURE_TRANSLATOR_REGION not set, skipping translation'
    )
    return null
  }

  try {
    const response = await fetch(
      `${AZURE_TRANSLATE_ENDPOINT}?api-version=3.0&to=en`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Ocp-Apim-Subscription-Region': region,
          'Content-Type': 'application/json',
        },
        // Deliberately omitting `from`: we already have a locally-detected
        // language for storage, but Azure's own auto-detection is more
        // reliable for the actual translation than trusting our franc/langs
        // code to be one Azure recognizes as a source language.
        body: JSON.stringify(texts.map((text) => ({ text }))),
      }
    )

    if (!response.ok) {
      console.error(
        `translate: Azure Translator returned ${response.status} ${response.statusText}`
      )
      return null
    }

    const data: Array<{ translations?: Array<{ text?: string }> }> =
      await response.json()

    const [titleResult, summaryResult] = data
    return [
      titleResult?.translations?.[0]?.text ?? null,
      summaryResult?.translations?.[0]?.text ?? null,
    ]
  } catch (err) {
    console.error('translate: Azure Translator request failed', err)
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
