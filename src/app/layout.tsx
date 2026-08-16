import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'
import { getUser } from '@/lib/supabase/server'
import { signOut } from '@/app/login/actions'

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

  return (
    <html lang="en">
      <body>
        <header className="flex items-center justify-between gap-4 p-4 border-b border-border text-sm">
          {user ? (
            <>
              <nav className="flex items-center gap-4 text-base font-semibold">
                <Link href="/" className="hover:underline">
                  Dashboard
                </Link>
                <Link href="/feeds" className="hover:underline">
                  Feeds
                </Link>
                <Link href="/indicators" className="hover:underline">
                  Indicators
                </Link>
              </nav>
              <div className="flex items-center gap-4">
                <span className="text-muted">{user.email}</span>
                <form action={signOut}>
                  <button type="submit" className="underline">
                    Sign out
                  </button>
                </form>
              </div>
            </>
          ) : (
            <>
              <span />
              <Link href="/login" className="underline">
                Sign in
              </Link>
            </>
          )}
        </header>
        {children}
      </body>
    </html>
  )
}
