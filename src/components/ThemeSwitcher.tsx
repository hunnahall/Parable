'use client'

import { useTheme } from 'next-themes'

const THEME_LABELS: Record<string, string> = {
  slate: 'Slate',
  olive: 'Olive',
  light: 'Light',
  dark: 'Dark',
}

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  return (
    <select
      // `theme` is undefined on the server and on the first client render
      // (next-themes only knows the real value after its own mount effect
      // runs) — falling back to 'light' here avoids a hydration mismatch
      // without needing a second local mounted-flag effect.
      value={theme ?? 'light'}
      onChange={(e) => setTheme(e.target.value)}
      className="border border-border rounded px-2 py-1 text-sm bg-background text-foreground"
      aria-label="Theme"
    >
      {Object.entries(THEME_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  )
}
