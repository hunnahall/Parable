// Curated rather than exhaustive (langs.all() is 7000+ ISO 639-3 entries,
// most never seen in an RSS feed) — this is the intersection of "languages
// this app's users are likely to want as a translation target" and
// "gpt-5-nano reliably translates into". Also doubles as the English name
// fed into the translate/summarize prompts, so it stays in one place
// instead of duplicating labels between the settings UI and the prompts.
export interface LanguageOption {
  code: string
  label: string
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'ru', label: 'Russian' },
  { code: 'ar', label: 'Arabic' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'hi', label: 'Hindi' },
  { code: 'tr', label: 'Turkish' },
  { code: 'pl', label: 'Polish' },
  { code: 'sv', label: 'Swedish' },
]

export const DEFAULT_LANGUAGE = 'en'

export function languageLabel(code: string): string {
  return SUPPORTED_LANGUAGES.find((lang) => lang.code === code)?.label ?? code
}
