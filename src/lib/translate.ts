import sanitizeHtml from 'sanitize-html'
import he from 'he'
import { franc } from 'franc'
import langs from 'langs'
import OpenAI from 'openai'
import { DEFAULT_LANGUAGE, languageLabel } from '@/lib/languages'

const MODEL = 'gpt-5-nano'
const REQUEST_TIMEOUT_MS = 15_000

// Titles are translated in batches rather than one call per article. The
// payload for a single headline is ~15 tokens, but every request also pays
// a developer prompt plus gpt-5-nano's reasoning-token floor, so per-call
// overhead — not the text — was the dominant cost. One call per feed
// instead of one per item is roughly a 10x reduction on this path, and it
// removes the same number of round trips from the ingest run's budget.
//
// Capped so a firehose feed's first fetch doesn't build one enormous
// request (and so a truncated response can't cost more than this many
// titles — see translateTitleBatch's split-and-retry).
const TITLE_BATCH_SIZE = 40
// Batches of one feed's titles, run a few at a time.
const TITLE_BATCH_CONCURRENCY = 3
// A translated headline is ~30 tokens; the JSON wrapper adds ~15 more.
// Plus a flat allowance for the reasoning tokens gpt-5-nano bills even at
// effort: 'minimal'. This is a ceiling, not a spend — unused headroom is
// free, and running out truncates the whole batch.
const OUTPUT_TOKENS_PER_TITLE = 60
const OUTPUT_TOKENS_OVERHEAD = 200

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

// One client for the process rather than one per call. Ingest runs up to
// FEED_CONCURRENCY x ITEM_CONCURRENCY requests in flight; constructing a
// client per call gave each one its own fetch agent and threw away every
// keep-alive connection.
let client: OpenAI | null = null
function openai(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null
  if (!client) client = new OpenAI({ apiKey, timeout: REQUEST_TIMEOUT_MS })
  return client
}

// Exported so callers that need the cleaned original-language title (e.g.
// the ingest route) can clean text with the exact same rules used for
// detection/translation, instead of re-implementing HTML stripping.
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

// Local, free, and run for every item — this is what keeps the API call
// off the majority of articles when the target language matches. Fed the
// title *and* the feed's description because franc needs more than a
// headline's worth of text to be reliable; the description is only ever
// used here, never sent anywhere.
export function detectLanguage(title: string, summary: string): string {
  const detected = franc(`${title} ${summary}`.trim())
  return detected === 'und' ? 'und' : toTwoLetterCode(detected)
}

// 'und' counts as needing translation. franc returns it for anything much
// under a sentence, which describes plenty of real headlines, and the two
// failure modes are not symmetric: a missed translation is a visibly
// untranslated headline sitting in the Inbox, while a needless one now
// costs a few tokens inside a batch and comes back unchanged (the prompt
// tells the model to pass through text already in the target language).
export function needsTranslation(detectedLanguage: string, targetLanguage: string): boolean {
  return detectedLanguage !== targetLanguage
}

// Translates one batch, keyed by the caller's own indices so a response
// that drops or reorders an entry can't silently shift every translation
// onto the wrong article. Returns a map of index -> translated title;
// indices the model omitted are simply absent.
async function translateTitleBatch(
  entries: { index: number; title: string }[],
  targetLanguage: string
): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  if (entries.length === 0) return out

  const api = openai()
  if (!api) {
    console.error('translate: OPENAI_API_KEY not set, skipping translation')
    return out
  }

  const targetName = languageLabel(targetLanguage)

  // Splits the batch and retries rather than losing every title in it.
  // Reached when the response was truncated or unparseable — with an
  // index-keyed JSON array, a cut-off response doesn't parse at all, so
  // without this one oversized batch would leave 40 headlines untranslated.
  const splitAndRetry = async (): Promise<Map<number, string>> => {
    if (entries.length === 1) return out
    const mid = Math.ceil(entries.length / 2)
    const [left, right] = await Promise.all([
      translateTitleBatch(entries.slice(0, mid), targetLanguage),
      translateTitleBatch(entries.slice(mid), targetLanguage),
    ])
    return new Map([...left, ...right])
  }

  try {
    const response = await api.responses.create({
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
          name: 'translations',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              translations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    index: { type: 'integer' },
                    title: { type: 'string' },
                  },
                  required: ['index', 'title'],
                  additionalProperties: false,
                },
              },
            },
            required: ['translations'],
            additionalProperties: false,
          },
        },
      },
      max_output_tokens: OUTPUT_TOKENS_OVERHEAD + OUTPUT_TOKENS_PER_TITLE * entries.length,
      input: [
        {
          role: 'developer',
          content:
            `Translate each article title into ${targetName}. Preserve meaning and ` +
            `tone; do not add commentary or labels. If a title is already in ` +
            `${targetName}, return it unchanged. Return one entry per input, ` +
            `echoing back its index.`,
        },
        {
          role: 'user',
          content: JSON.stringify(entries),
        },
      ],
    })

    // max_output_tokens counts reasoning tokens too, so a batch can run out
    // of room even when the titles themselves are short.
    if (response.status === 'incomplete') {
      console.error(`translate: response truncated for ${entries.length} titles, splitting`)
      return splitAndRetry()
    }

    const text = response.output_text
    if (!text) {
      console.error('translate: OpenAI returned no output text')
      return out
    }

    const parsed: { translations?: { index?: number; title?: string }[] } = JSON.parse(text)
    const valid = new Set(entries.map((entry) => entry.index))
    for (const entry of parsed.translations ?? []) {
      if (typeof entry.index !== 'number' || !valid.has(entry.index)) continue
      if (typeof entry.title !== 'string' || !entry.title.trim()) continue
      out.set(entry.index, entry.title.trim())
    }
    return out
  } catch (err) {
    console.error('translate: OpenAI request failed', err)
    // A JSON.parse failure is the other way a truncated/malformed response
    // shows up; splitting recovers the half that would have parsed.
    if (err instanceof SyntaxError) return splitAndRetry()
    return out
  }
}

// Translates a list of titles into `targetLanguage`, returning an array the
// same length and order as the input. Entries the API couldn't translate
// come back null, which callers store as "no translation" — the original
// title is what gets displayed then (see bestTitle in articles/list.ts).
//
// Callers are expected to have already filtered out titles that don't need
// translating (see detectLanguage/needsTranslation); passing one through
// anyway is harmless, just wasteful.
export async function translateTitles(
  titles: string[],
  targetLanguage: string = DEFAULT_LANGUAGE
): Promise<(string | null)[]> {
  const results: (string | null)[] = new Array(titles.length).fill(null)
  if (titles.length === 0) return results

  const entries = titles
    .map((title, index) => ({ index, title }))
    .filter((entry) => entry.title.length > 0)

  const batches: { index: number; title: string }[][] = []
  for (let i = 0; i < entries.length; i += TITLE_BATCH_SIZE) {
    batches.push(entries.slice(i, i + TITLE_BATCH_SIZE))
  }

  // Not mapWithConcurrency: these are already few (one batch per 40 titles)
  // and each is independent, so a plain chunked Promise.all keeps the
  // in-flight count bounded without another abstraction.
  for (let i = 0; i < batches.length; i += TITLE_BATCH_CONCURRENCY) {
    const translated = await Promise.all(
      batches
        .slice(i, i + TITLE_BATCH_CONCURRENCY)
        .map((batch) => translateTitleBatch(batch, targetLanguage))
    )
    for (const map of translated) {
      for (const [index, title] of map) results[index] = title
    }
  }

  return results
}
