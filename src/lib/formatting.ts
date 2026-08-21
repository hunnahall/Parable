// Shared date/time formatting, aware of the user's timezone/clock-format
// preferences (src/lib/preferences/data.ts) — replaces the several
// near-identical inline `formatDate` helpers that used to live in
// ArticleList.tsx, FeedManager.tsx, IndicatorManager.tsx, etc. An empty
// `timezone` means "auto" — omitting the `timeZone` option is already
// exactly today's (and the browser's default) behavior, so no branch is
// needed for that case.

export interface FormattingPrefs {
  timezone: string
  clockFormat: '12h' | '24h'
}

function toDate(value: string | Date | null): Date | null {
  if (value === null) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(
  value: string | Date | null,
  prefs: Pick<FormattingPrefs, 'timezone'>,
  opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
): string | null {
  const date = toDate(value)
  if (!date) return null
  return date.toLocaleDateString(undefined, {
    ...opts,
    ...(prefs.timezone ? { timeZone: prefs.timezone } : {}),
  })
}

export function formatTime(value: string | Date | null, prefs: FormattingPrefs): string | null {
  const date = toDate(value)
  if (!date) return null
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: prefs.clockFormat === '12h',
    ...(prefs.timezone ? { timeZone: prefs.timezone } : {}),
  })
}

export function formatDateTime(value: string | Date | null, prefs: FormattingPrefs): string | null {
  const date = toDate(value)
  if (!date) return null
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: prefs.clockFormat === '12h',
    ...(prefs.timezone ? { timeZone: prefs.timezone } : {}),
  })
}
