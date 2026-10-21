// Measures the on-demand summary and reader view against the 2-second
// target in context.md (roadmap step 11): time to the first streamed text,
// and total time. Fetches real articles, so it costs a few cents at most.
// Nothing is stored.
// Run: npx tsx src/scripts/test-ondemand-latency.ts [article URL ...]
import fs from 'node:fs'
import path from 'node:path'

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const i = trimmed.indexOf('=')
    if (i === -1) continue
    const key = trimmed.slice(0, i)
    if (!(key in process.env)) process.env[key] = trimmed.slice(i + 1)
  }
}
loadEnvLocal()

const DEFAULT_URLS = [
  'https://www.france24.com/fr/afrique/20261020-nigeria-annonce-premier-cas-virus-ebola-abuja',
  'https://www.rfi.fr/fr/afrique/20261018-tunisie-plusieurs-milliers-de-personnes-manifestent-contre-la-hausse-du-co%C3%BBt-de-la-vie-et-le-recul-des-libert%C3%A9s',
]

async function drain(stream: ReadableStream<Uint8Array>): Promise<void> {
  const reader = stream.getReader()
  for (;;) if ((await reader.read()).done) return
}

async function main() {
  const { fetchAndExtractContent } = await import('../lib/articles/extract')
  const { streamText } = await import('../lib/ondemand/stream')
  const { summaryInput, summaryInstructions } = await import('../lib/summarize')
  const { readerInstructions, READER_INPUT_MAX_LENGTH, READER_MAX_OUTPUT_TOKENS } = await import('../lib/ondemand/prompts')

  const urls = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_URLS
  for (const url of urls) {
    const extracted = await fetchAndExtractContent(url)
    if ('error' in extracted) {
      console.log(`${url}\n  extraction failed: ${extracted.error}`)
      continue
    }
    console.log(`${url}\n  ${extracted.text.length} characters`)

    for (const kind of ['summary', 'reader'] as const) {
      const startedAt = Date.now()
      let result = ''
      await drain(
        streamText(
          kind === 'summary'
            ? { instructions: summaryInstructions('English'), input: summaryInput('', extracted.text), maxOutputTokens: 200 }
            : {
                instructions: readerInstructions('English'),
                input: extracted.text.slice(0, READER_INPUT_MAX_LENGTH),
                maxOutputTokens: READER_MAX_OUTPUT_TOKENS,
              },
          async (outcome) => {
            result =
              `first text ${outcome.firstTextMs ?? '-'} ms, total ${Date.now() - startedAt} ms, ` +
              `complete=${outcome.complete}, in=${outcome.usage.inputTokens} out=${outcome.usage.outputTokens} ` +
              `reasoning=${outcome.usage.reasoningTokens}\n    ${outcome.text.slice(0, 160).replace(/\n/g, ' ')}`
          }
        )
      )
      console.log(`  ${kind}: ${result}`)
    }
  }
}
main()
