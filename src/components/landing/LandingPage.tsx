import Link from 'next/link'
import { Rss, LineChart, LayoutGrid, Bookmark } from 'lucide-react'
import ParableLogo from '@/components/brand/ParableLogo'
import CovenantWorksCredit from '@/components/brand/CovenantWorksCredit'

const FEATURES = [
  { icon: Rss, label: 'Read RSS feeds' },
  { icon: LineChart, label: 'Track economic indicators' },
  { icon: LayoutGrid, label: 'Arrange your dashboard' },
  { icon: Bookmark, label: 'Save what matters' },
]

export default function LandingPage() {
  return (
    <div className="bg-dot-grid min-h-[calc(100vh-65px)]">
      <div className="flex flex-col items-center text-center px-8 py-24 max-w-2xl mx-auto">
        <h1 className="sr-only">Parable</h1>
        <ParableLogo height={96} />
        <p className="text-xl text-muted mt-6 mb-10">
          A simple dashboard for feeds and indicators.
        </p>
        <Link
          href="/login"
          className="rounded-full bg-white text-black px-8 py-3 text-sm font-semibold shadow-sm border border-border mb-16 transition-colors hover:bg-foreground/5"
        >
          Sign in to get started
        </Link>
        <ul className="inline-grid grid-cols-2 gap-x-8 gap-y-4">
          {FEATURES.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-2 text-sm text-muted">
              <Icon size={16} strokeWidth={2} aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </div>
      <CovenantWorksCredit />
    </div>
  )
}
