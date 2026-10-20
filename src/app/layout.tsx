import type { Metadata } from 'next'
import Link from 'next/link'
import { Hanken_Grotesk, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import { getUser } from '@/lib/supabase/server'
import { getUserPreferences } from '@/lib/preferences/data'
import { getInboxStoryCount } from '@/lib/stories/data'
import ParableLogo from '@/components/brand/ParableLogo'
import Sidebar from '@/components/layout/Sidebar'
import MobileSidebarDrawer from '@/components/layout/MobileSidebarDrawer'
import CommandPalette from '@/components/layout/CommandPalette'
import { ToastProvider } from '@/components/ui/Toast'

// Covenant Works Design System v2: one sans for display and interface, one
// mono for labels, figures and keyboard hints.
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
  const [prefs, inboxCount] = await Promise.all([
    getUserPreferences(),
    user ? getInboxStoryCount() : Promise.resolve(0),
  ])

  return (
    <html
      lang="en"
      // Parable's signature color. "system" leaves data-theme off so
      // tokens.css follows the device (dark unless it asks for light).
      data-accent="slate-blue"
      data-theme={prefs.theme === 'system' ? undefined : prefs.theme}
      className={`${hankenGrotesk.variable} ${plexMono.variable}`}
    >
      <body className="min-h-dvh">
        <ToastProvider>
          {user ? (
            <div className="flex min-h-dvh flex-col min-[1000px]:flex-row">
              <Sidebar userEmail={user.email ?? ''} inboxCount={inboxCount} />
              <MobileSidebarDrawer userEmail={user.email ?? ''} inboxCount={inboxCount} />
              <main className="min-w-0 flex-1">{children}</main>
              <CommandPalette />
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
