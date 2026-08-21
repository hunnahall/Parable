import type { Metadata } from 'next'
import Link from 'next/link'
import { Hanken_Grotesk, Inter, Work_Sans, Instrument_Sans, Lato } from 'next/font/google'
import './globals.css'
import { getUser } from '@/lib/supabase/server'
import { getUserPreferences } from '@/lib/preferences/data'
import { signOut } from '@/app/login/actions'
import ParableMark from '@/components/brand/ParableMark'
import NavLinks from '@/components/layout/NavLinks'
import { PreferencesProvider } from '@/components/preferences/PreferencesProvider'

const hankenGrotesk = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken-grotesk' })
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const workSans = Work_Sans({ subsets: ['latin'], variable: '--font-work-sans' })
const instrumentSans = Instrument_Sans({ subsets: ['latin'], variable: '--font-instrument-sans' })
const lato = Lato({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-lato' })

export const metadata: Metadata = {
  title: 'Parable',
  description: 'A personal dashboard with RSS feeds and economic indicators',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()
  const prefs = await getUserPreferences()

  return (
    <html
      lang="en"
      data-theme={prefs.theme === 'system' ? undefined : prefs.theme}
      data-font={prefs.font === 'inter' ? undefined : prefs.font}
      className={`${hankenGrotesk.variable} ${inter.variable} ${workSans.variable} ${instrumentSans.variable} ${lato.variable}`}
    >
      <body>
        <PreferencesProvider preferences={prefs}>
          <header className="flex items-center justify-between gap-4 p-4 border-b border-border text-sm">
            {user ? (
              <>
                <div className="flex items-center gap-6">
                  <Link href="/" aria-label="Parable">
                    <ParableMark size={22} />
                  </Link>
                  <NavLinks />
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-muted">{user.email}</span>
                  <form action={signOut}>
                    <button type="submit" className="underline hover:text-muted transition-colors">
                      Sign out
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <>
                <Link href="/" aria-label="Parable">
                  <ParableMark size={22} />
                </Link>
                <Link href="/login" className="underline hover:text-muted transition-colors">
                  Sign in
                </Link>
              </>
            )}
          </header>
          {children}
        </PreferencesProvider>
      </body>
    </html>
  )
}
