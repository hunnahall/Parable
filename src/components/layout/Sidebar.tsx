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
  inboxCount,
}: {
  initialCollapsed: boolean
  userEmail: string
  inboxCount: number
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
        (collapsed ? 'w-16' : 'w-52')
      }
    >
      <div
        className={
          collapsed
            ? 'flex items-center justify-center px-3 py-4'
            : 'flex items-center justify-between gap-2 px-3 py-4'
        }
      >
        <Link href="/" aria-label="Parable" className="min-w-0">
          {collapsed ? <ParableMark size={33} /> : <ParableLogo height={42} />}
        </Link>
        {!collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Collapse sidebar"
            className="text-muted hover:text-foreground transition-colors shrink-0"
          >
            <PanelLeftClose size={15} strokeWidth={1.75} aria-hidden="true" />
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
          <PanelLeftOpen size={15} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}

      <div className="flex-1 overflow-y-auto px-2">
        <SidebarNavList collapsed={collapsed} inboxCount={inboxCount} />
      </div>

      <div className="border-t border-border-subtle p-3 text-base">
        {!collapsed && (
          <div className="text-base text-muted truncate mb-2">{userEmail}</div>
        )}
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
