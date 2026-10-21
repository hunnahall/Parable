'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, LogOut, Monitor, Moon, Settings, Sun, type LucideIcon } from 'lucide-react'
import { signOut } from '@/app/login/actions'
import { updatePreferences } from '@/lib/preferences/actions'
import { applyTheme } from '@/lib/preferences/applyTheme'
import type { ThemeChoice } from '@/lib/preferences/data'

const THEMES: { value: ThemeChoice; label: string; icon: LucideIcon }[] = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun },
]

// Up to two letters from the part of the email before the @: "hunter.ch"
// gives "HC", "hogfanhunter" gives "HO".
function initials(email: string): string {
  const name = email.split('@')[0] ?? ''
  const parts = name.split(/[._\-+]+/).filter(Boolean)
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)
  return letters.toUpperCase() || '?'
}

// The account row at the foot of the sidebar: a circle avatar and the
// email, opening a menu upward with Settings, the theme and Sign out.
export default function AccountMenu({
  userEmail,
  theme: initialTheme,
  onNavigate,
}: {
  userEmail: string
  theme: ThemeChoice
  onNavigate?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState(initialTheme)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function chooseTheme(value: ThemeChoice) {
    setTheme(value)
    applyTheme(value)
    void updatePreferences({ theme: value })
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="cw-nav-item h-10! w-full text-left"
      >
        <span className="cw-avatar size-7!" aria-hidden="true">
          {initials(userEmail)}
        </span>
        <span className="min-w-0 flex-1 truncate" title={userEmail}>
          {userEmail}
        </span>
      </button>

      {open && (
        <div role="menu" aria-label="Account" className="cw-menu absolute bottom-full left-0 right-0 mb-1">
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onNavigate?.()
            }}
            className="cw-menu__item no-underline"
          >
            <Settings strokeWidth={1.5} aria-hidden="true" />
            Settings
          </Link>
          <div className="cw-menu__label">Theme</div>
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="menuitemradio"
              aria-checked={theme === t.value}
              onClick={() => chooseTheme(t.value)}
              className="cw-menu__item"
            >
              <t.icon strokeWidth={1.5} aria-hidden="true" />
              <span className="flex-1">{t.label}</span>
              {theme === t.value && <Check strokeWidth={1.5} aria-hidden="true" className="!text-accent" />}
            </button>
          ))}
          <div className="cw-menu__sep" role="separator" />
          <form action={signOut}>
            <button type="submit" role="menuitem" className="cw-menu__item">
              <LogOut strokeWidth={1.5} aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
