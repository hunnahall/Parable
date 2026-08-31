'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function HeaderSignInLink() {
  const pathname = usePathname()

  if (pathname === '/login') return null

  return (
    <Link href="/login" className="underline hover:text-muted transition-colors">
      Sign in
    </Link>
  )
}
