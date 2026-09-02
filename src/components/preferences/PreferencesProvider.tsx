'use client'

import { createContext, useContext } from 'react'
import type { UserPreferences } from '@/lib/preferences/data'

const PreferencesContext = createContext<UserPreferences | null>(null)

// Theme and font apply via attributes rendered directly on <html> in
// src/app/layout.tsx (a Server Component, so they're flash-free on first
// paint) — this context is only for the preferences nested client
// components need at render time: timezone/clock-format for date
// formatting.
export function PreferencesProvider({
  preferences,
  children,
}: {
  preferences: UserPreferences
  children: React.ReactNode
}) {
  return <PreferencesContext.Provider value={preferences}>{children}</PreferencesContext.Provider>
}

export function usePreferences(): UserPreferences {
  const prefs = useContext(PreferencesContext)
  if (!prefs) throw new Error('usePreferences must be used within a PreferencesProvider')
  return prefs
}
