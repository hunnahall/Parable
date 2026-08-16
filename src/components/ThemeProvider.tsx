'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      themes={['slate', 'olive', 'light', 'dark']}
      defaultTheme="light"
    >
      {children}
    </NextThemesProvider>
  )
}
