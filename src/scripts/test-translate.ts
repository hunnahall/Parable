// Standalone smoke test for src/lib/translate.ts — not part of the app,
// just a way to sanity-check detection + batched translation against the
// live API.
//
// Run with:
//   npx tsx src/scripts/test-translate.ts
//
// Loads OPENAI_API_KEY from .env.local if present. Without it,
// translateTitles() still runs end-to-end — it just returns nulls, which
// is the documented "API failed" behavior, so this script is also a check
// of that path.
//
// Every sample is sent in ONE batched call, which is how ingest uses this
// (see prepareItems in src/lib/feeds/ingest.ts): translation is batched per
// feed rather than paid per item. So this also exercises the part most
// likely to break silently — results being keyed back to the right article
// by index rather than by arrival order.
//
// A note on the Arabic samples specifically: a terminal's own bidi
// renderer can visually reorder RTL text next to the ASCII labels this
// script prints around it, which can *look* like corruption even when
// the underlying string is completely correct. So beyond eyeballing the
// printed output, each sample below is checked programmatically:
//   - detectLanguage must land on the expected code (this is what proves
//     the "arb" -> "ar" macrolanguage override in translate.ts actually
//     fires, since franc reports Arabic as "arb", not "ar")
//   - translated text must be non-null, contain no leftover HTML tags,
//     and contain no leftover Arabic-script characters (i.e. it was
//     actually translated, not just passed through)

import fs from 'node:fs'
import path from 'node:path'
import { detectLanguage, needsTranslation, stripHtml, translateTitles } from '../lib/translate'
import { DEFAULT_LANGUAGE } from '../lib/languages'

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return

  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const i = trimmed.indexOf('=')
    if (i === -1) continue
    const key = trimmed.slice(0, i)
    if (!(key in process.env)) {
      process.env[key] = trimmed.slice(i + 1)
    }
  }
}

loadEnvLocal()

// Arabic block (U+0600–U+06FF) + Arabic Supplement (U+0750–U+077F)
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿ]/
const HTML_TAG = /<[^>]+>/

interface Sample {
  label: string
  title: string
  summary: string
  expectedLanguage: string
}

const samples: Sample[] = [
  {
    label: 'English (should skip translation entirely)',
    title: 'Fed Holds Interest Rates Steady',
    summary:
      '<p>The Federal Reserve announced today that it will maintain current interest rates.</p><p>Officials cited stable inflation data as the primary reason.</p>',
    expectedLanguage: 'en',
  },
  {
    label: 'Spanish',
    title: 'El Banco Central Sube las Tasas de Interés',
    summary:
      '<p>El banco central anunció hoy un aumento en las tasas de interés.</p><p>Esta decisión afecta directamente a los préstamos hipotecarios y de consumo en todo el país.</p>',
    expectedLanguage: 'es',
  },
  {
    label: 'French',
    title: 'La Banque Centrale Relève ses Taux Directeurs',
    summary:
      "<p>La banque centrale a annoncé aujourd'hui une hausse de ses taux d'intérêt directeurs.</p><p>Cette décision vise à contenir l'inflation persistante observée ces derniers mois.</p>",
    expectedLanguage: 'fr',
  },
  {
    label: 'German',
    title: 'Zentralbank Erhöht die Leitzinsen',
    summary:
      '<p>Die Zentralbank hat heute eine Erhöhung der Leitzinsen bekannt gegeben.</p><p>Diese Entscheidung soll die anhaltend hohe Inflation eindämmen.</p>',
    expectedLanguage: 'de',
  },
  {
    label: 'Japanese',
    title: '中央銀行が金利を引き上げ',
    summary:
      '<p>中央銀行は本日、政策金利の引き上げを発表しました。</p><p>この決定は、根強いインフレを抑制することを目的としています。</p>',
    expectedLanguage: 'ja',
  },
  {
    label: 'Arabic (clean, single-script headline)',
    title: 'البنك المركزي يرفع أسعار الفائدة لمواجهة التضخم',
    summary:
      '<p>أعلن البنك المركزي اليوم عن رفع أسعار الفائدة بمقدار نصف نقطة مئوية.</p><p>ويأتي هذا القرار في إطار الجهود المستمرة لكبح جماح التضخم المرتفع.</p>',
    expectedLanguage: 'ar',
  },
  {
    label: 'Arabic (realistic mixed RTL/LTR — embedded Western digits and a date)',
    title: 'أوبك تعلن خفض إنتاج النفط بنسبة 2% اعتباراً من يناير',
    summary:
      '<p>أعلنت منظمة أوبك اليوم عن خفض الإنتاج بنسبة 2% ابتداءً من كانون الثاني/يناير 2026.</p><p>ويأتي القرار وسط تراجع الأسعار العالمية للنفط خلال الأشهر الأخيرة.</p>',
    expectedLanguage: 'ar',
  },
  {
    label: 'Undetermined (too short for franc to have any confidence)',
    title: 'Hi',
    summary: 'ok',
    expectedLanguage: 'und',
  },
]

async function main() {
  const hasCreds = !!process.env.OPENAI_API_KEY
  console.log(
    hasCreds
      ? 'OPENAI_API_KEY found — samples needing translation will call the live API.\n'
      : 'No OPENAI_API_KEY found — every translation should come back null.\n'
  )

  // Mirrors prepareItems: detect locally, then send only what needs
  // translating, in one batch, and key the results back by index.
  const detected = samples.map((sample) => ({
    sample,
    language: detectLanguage(stripHtml(sample.title), stripHtml(sample.summary)),
  }))
  const toTranslate = detected.flatMap((entry, index) =>
    needsTranslation(entry.language, DEFAULT_LANGUAGE) ? [index] : []
  )
  console.log(
    `${samples.length} samples, ${toTranslate.length} sent in 1 batched call ` +
      `(the other ${samples.length - toTranslate.length} cost nothing).\n`
  )

  const translated = await translateTitles(
    toTranslate.map((index) => stripHtml(samples[index].title)),
    DEFAULT_LANGUAGE
  )
  const titleEnByIndex = new Map<number, string | null>()
  toTranslate.forEach((index, i) => titleEnByIndex.set(index, translated[i]))

  let failures = 0

  detected.forEach((entry, index) => {
    const { sample, language } = entry
    const titleEn = titleEnByIndex.get(index) ?? null
    console.log(`--- ${sample.label} ---`)
    console.log({ original_language: language, title_en: titleEn })

    const checks: Array<[string, boolean]> = [
      [`detectLanguage === "${sample.expectedLanguage}"`, language === sample.expectedLanguage],
    ]

    // 'und' is deliberately treated as "needs translation" — franc returns
    // it for anything much under a sentence, and an untranslated headline
    // in the Inbox is worse than a pass-through call inside a batch.
    if (sample.expectedLanguage === DEFAULT_LANGUAGE) {
      checks.push(['skipped the API entirely (already in target language)', titleEn === null])
    } else if (hasCreds) {
      checks.push(
        ['title_en is non-null', titleEn !== null],
        ['translated title has no leftover HTML tags', !HTML_TAG.test(titleEn ?? '')]
      )
      if (sample.expectedLanguage === 'ar') {
        checks.push([
          'translated title has no leftover Arabic script (RTL -> LTR actually happened)',
          !ARABIC_SCRIPT.test(titleEn ?? ''),
        ])
      }
    } else {
      checks.push(['title_en is null without credentials', titleEn === null])
    }

    for (const [description, passed] of checks) {
      console.log(`  ${passed ? '✓' : '✗'} ${description}`)
      if (!passed) failures++
    }
    console.log()
  })

  if (failures > 0) {
    console.error(`${failures} check(s) failed.`)
    process.exitCode = 1
  } else {
    console.log('All checks passed.')
  }
}

main()
