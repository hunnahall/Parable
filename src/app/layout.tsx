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
        <header className="flex items-center justify-end gap-4 p-4 border-b text-sm">
          {user ? (
            <>
              <span className="text-gray-600">{user.email}</span>
              <form action={signOut}>
                <button type="submit" className="underline">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link href="/login" className="underline">
              Sign in
            </Link>
          )}
        </header>
        {children}
      </body>
    </html>
  )
}