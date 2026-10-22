import type { Metadata } from 'next'
import Link from 'next/link'
import { Hanken_Grotesk, IBM_Plex_Mono, Newsreader } from 'next/font/google'
import './globals.css'
import { getUser } from '@/lib/supabase/server'
import { getUserPreferences } from '@/lib/preferences/data'
import { getStories, inboxCounts } from '@/lib/stories/data'
import { listCategories } from '@/lib/categories/data'
import { getHealth, INGEST_STALE_HOURS } from '@/lib/health/data'
import type { ShellData } from '@/components/layout/sidebarNav'
import ParableLogo from '@/components/brand/ParableLogo'
import Sidebar from '@/components/layout/Sidebar'
import MobileSidebarDrawer from '@/components/layout/MobileSidebarDrawer'
import CommandPalette from '@/components/layout/CommandPalette'
import { ToastProvider } from '@/components/ui/Toast'

// Covenant Works Design System v2: one sans for display and interface, one
// mono for labels, figures and keyboard hints. Parable adds a serif for
// long-form reading (the reader view and summaries), set as --font-read.
const hankenGrotesk = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-hanken-grotesk',
})
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
})
const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-newsreader',
})

export const metadata: Metadata = {
  title: 'Parable',
  description: 'The last 12 hours of your countries and topics, in English.',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()
  // Independent of each other (both only need `user`, already resolved
  // above and memoized by React's cache() for the rest of this request).
  // The Inbox read here is cached for the request, so the Inbox page reuses
  // it instead of running story_feed again.
  const [prefs, inbox, categories, health] = await Promise.all([
    getUserPreferences(),
    user ? getStories('inbox') : Promise.resolve([]),
    user ? listCategories() : Promise.resolve([]),
    user ? getHealth() : Promise.resolve(null),
  ])
  const { total: inboxCount, byCategory: categoryCounts } = inboxCounts(inbox)
  const shell: ShellData = {
    userEmail: user?.email ?? '',
    inboxCount,
    categories: categories.map((c) => ({ id: c.id, name: c.name, count: categoryCounts[c.id] ?? 0 })),
    theme: prefs.theme,
    lastSuccessAt: health?.lastSuccessAt ?? null,
    staleHours: INGEST_STALE_HOURS,
  }

  return (
    <html
      lang="en"
      // Parable's signature color. "system" leaves data-theme off so
      // tokens.css follows the device (dark unless it asks for light).
      data-accent="periwinkle"
      data-theme={prefs.theme === 'system' ? undefined : prefs.theme}
      className={`${hankenGrotesk.variable} ${plexMono.variable} ${newsreader.variable}`}
    >
      <body className="min-h-dvh">
        <ToastProvider>
          {user ? (
            <div className="flex min-h-dvh flex-col min-[1000px]:flex-row">
              <Sidebar shell={shell} />
              <MobileSidebarDrawer shell={shell} />
              <main className="min-w-0 flex-1">{children}</main>
              <CommandPalette categories={shell.categories} />
            </div>
          ) : (
            <>
              <header className="flex h-14 items-center border-b border-border px-4 min-[1000px]:px-8">
                <Link href="/" aria-label="Parable">
                  <ParableLogo height={22} tone="accent" />
                </Link>
              </header>
              {children}
            </>
          )}
        </ToastProvider>
      </body>
    </html>
  )
}
