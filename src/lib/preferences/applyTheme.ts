import type { ThemeChoice } from './data'

// Applies a theme on the page right away; the saved preference (written by
// updatePreferences) makes the server render it on every later request.
export function applyTheme(theme: ThemeChoice) {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}
