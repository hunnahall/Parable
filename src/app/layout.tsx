import type { Metadata } from 'next'
import Link from 'next/link'
import { Hanken_Grotesk, Inter, Work_Sans, Instrument_Sans, Lato } from 'next/font/google'
import './globals.css'
import { getUser } from '@/lib/supabase/server'
import { getUserPreferences } from '@/lib/preferences/data'
import { getArticlesUnfiledCount } from '@/lib/dashboard/data'
import ParableMark from '@/components/brand/ParableMark'
import Sidebar from '@/components/layout/Sidebar'
import MobileSidebarDrawer from '@/components/layout/MobileSidebarDrawer'
import { PreferencesProvider } from '@/components/preferences/PreferencesProvider'

const hankenGrotesk = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken-grotesk' })
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const workSans = Work_Sans({ subsets: ['latin'], variable: '--font-work-sans' })
const instrumentSans = Instrument_Sans({ subsets: ['latin'], variable: '--font-instrument-sans' })
const lato = Lato({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-lato' })

export const metadata: Metadata = {
  title: 'Parable',
  description: 'A personal dashboard for RSS feeds',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()
  // Independent of each other (both only need `user`, already resolved
  // above and memoized by React's cache() for the rest of this request) —
  // running them sequentially was paying for two round trips end-to-end
  // on every single navigation, since this layout re-executes on every
  // request (getUser() reads cookies(), which opts the whole tree out of
  // Next.js's route-segment caching).
  const [prefs, articlesUnfiledCount] = await Promise.all([
    getUserPreferences(),
    user ? getArticlesUnfiledCount() : Promise.resolve(0),
  ])

  return (
    <html
      lang="en"
      data-font={prefs.font === 'inter' ? undefined : prefs.font}
      className={`${hankenGrotesk.variable} ${inter.variable} ${workSans.variable} ${instrumentSans.variable} ${lato.variable}`}
    >
      <body>
        <PreferencesProvider preferences={prefs}>
          {user ? (
            <div className="flex min-h-screen">
              <Sidebar
                initialCollapsed={prefs.sidebarCollapsed}
                userEmail={user.email ?? ''}
                articlesUnfiledCount={articlesUnfiledCount}
              />
              <div className="flex-1 min-w-0 flex flex-col">
                <MobileSidebarDrawer
                  userEmail={user.email ?? ''}
                  articlesUnfiledCount={articlesUnfiledCount}
                />
                <main className="flex-1 min-w-0">{children}</main>
              </div>
            </div>
          ) : (
            <>
              <header className="flex items-center justify-between gap-4 p-4 border-b border-border text-base">
                <Link href="/" aria-label="Parable">
                  <ParableMark size={22} />
                </Link>
                <Link href="/login" className="underline hover:text-muted transition-colors">
                  Sign in
                </Link>
              </header>
              {children}
            </>
          )}
        </PreferencesProvider>
      </body>
    </html>
  )
}
