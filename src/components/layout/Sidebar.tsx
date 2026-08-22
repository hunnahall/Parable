'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import ParableLogo from '@/components/brand/ParableLogo'
import ParableMark from '@/components/brand/ParableMark'
import SidebarNavList from './SidebarNavList'
import { setSidebarCollapsed } from '@/lib/preferences/actions'
import { signOut } from '@/app/login/actions'

export default function Sidebar({
  initialCollapsed,
  userEmail,
  articlesUnfiledCount,
}: {
  initialCollapsed: boolean
  userEmail: string
  articlesUnfiledCount: number
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [, startTransition] = useTransition()

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    startTransition(() => {
      setSidebarCollapsed(next)
    })
  }

  return (
    <aside
      className={
        'hidden md:flex flex-col shrink-0 border-r border-border h-screen sticky top-0 transition-[width] duration-[var(--motion-standard)] ease-out ' +
        (collapsed ? 'w-16' : 'w-56')
      }
    >
      <div className="flex items-center justify-between gap-2 p-4">
        <Link href="/" aria-label="Parable" className="min-w-0">
          {collapsed ? <ParableMark size={22} /> : <ParableLogo height={22} />}
        </Link>
        {!collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Collapse sidebar"
            className="text-muted hover:text-foreground transition-colors shrink-0"
          >
            <PanelLeftClose size={17} aria-hidden="true" />
          </button>
        )}
      </div>

      {collapsed && (
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Expand sidebar"
          className="text-muted hover:text-foreground transition-colors mx-auto mb-2"
        >
          <PanelLeftOpen size={17} aria-hidden="true" />
        </button>
      )}

      <div className="flex-1 overflow-y-auto px-2">
        <SidebarNavList collapsed={collapsed} articlesUnfiledCount={articlesUnfiledCount} />
      </div>

      <div className="border-t border-border-subtle p-3 text-sm">
        {!collapsed && <div className="text-muted truncate mb-2">{userEmail}</div>}
        <form action={signOut}>
          <button
            type="submit"
            className="underline text-muted hover:text-foreground transition-colors"
          >
            {collapsed ? '→' : 'Sign out'}
          </button>
        </form>
      </div>
    </aside>
  )
}
