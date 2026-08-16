// Standalone smoke test for src/lib/translate.ts — not part of the app,
// just a way to sanity-check detection + translation before wiring it
// into the (not-yet-built) RSS ingest job.
//
// Run with:
//   npx tsx src/scripts/test-translate.ts
//
// Loads OPENAI_API_KEY from .env.local if present. Without it,
// translateArticle() still runs end-to-end — it just falls back to nulls
// for the _en fields, which is the documented "API failed" behavior, so
// this script is also a check of that path.
//
// A note on the Arabic samples specifically: a terminal's own bidi
// renderer can visually reorder RTL text next to the ASCII labels this
// script prints around it, which can *look* like corruption even when
// the underlying string is completely correct. So beyond eyeballing the
// printed output, each sample below is checked programmatically:
//   - original_language must land on the expected code (this is what
//     proves the "arb" -> "ar" macrolanguage override in translate.ts
//     actually fires, since franc reports Arabic as "arb", not "ar")
//   - translated text must be non-null, contain no leftover HTML tags,
//     and contain no leftover Arabic-script characters (i.e. it was
//     actually translated, not just passed through)
//   - the source string must have zero surrogate pairs, so the 500-char
//     summary truncation in translate.ts (a plain .slice) can't split a
//     character in half — true for Arabic script, but worth asserting
//     rather than assuming, since it would NOT hold for e.g. emoji

import fs from 'node:fs'
import path from 'node:path'
import { translateArticle } from '../lib/translate'

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

function checkNoSurrogatePairs(sample: Sample) {
  const combined = sample.title + sample.summary
  return [...combined].length === combined.length
}

async function main() {
  const hasCreds = !!process.env.OPENAI_API_KEY
  console.log(
    hasCreds
      ? 'OPENAI_API_KEY found — non-English samples will call the live API.\n'
      : 'No OPENAI_API_KEY found — non-English samples should come back with title_en/summary_en: null.\n'
  )

  let failures = 0

  for (const sample of samples) {
    console.log(`--- ${sample.label} ---`)
    const result = await translateArticle(sample.title, sample.summary)
    console.log(result)

    const checks: Array<[string, boolean]> = [
      [
        `original_language === "${sample.expectedLanguage}"`,
        result.original_language === sample.expectedLanguage,
      ],
      ['source text has no surrogate pairs (truncation-safe)', checkNoSurrogatePairs(sample)],
    ]

    const shouldHaveTranslation =
      hasCreds &&
      sample.expectedLanguage !== 'en' &&
      sample.expectedLanguage !== 'und'

    if (shouldHaveTranslation) {
      checks.push(
        ['title_en is non-null', result.title_en !== null],
        ['summary_en is non-null', result.summary_en !== null],
        [
          'translated text has no leftover HTML tags',
          !HTML_TAG.test(result.title_en ?? '') &&
            !HTML_TAG.test(result.summary_en ?? ''),
        ]
      )
      if (sample.expectedLanguage === 'ar') {
        checks.push([
          'translated text has no leftover Arabic script (RTL -> LTR actually happened)',
          !ARABIC_SCRIPT.test(result.title_en ?? '') &&
            !ARABIC_SCRIPT.test(result.summary_en ?? ''),
        ])
      }
    } else {
      checks.push(
        ['title_en is null', result.title_en === null],
        ['summary_en is null', result.summary_en === null]
      )
    }

    for (const [description, passed] of checks) {
      console.log(`  ${passed ? '✓' : '✗'} ${description}`)
      if (!passed) failures++
    }
    console.log()
  }

  if (failures > 0) {
    console.error(`${failures} check(s) failed.`)
    process.exitCode = 1
  } else {
    console.log('All checks passed.')
  }
}

main()
