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
    <div className="relative bg-dot-grid min-h-[calc(100vh-65px)]">
      <div className="animate-landing-reveal flex flex-col items-center text-center px-8 py-24 max-w-2xl mx-auto">
        <h1 className="sr-only">Parable</h1>
        <ParableLogo height={144} />
        <p className="text-xl text-muted mt-6 mb-10">
          A simple dashboard for feeds and indicators.
        </p>
        <Link
          href="/login"
          className="border border-brand bg-background text-foreground px-8 py-3 text-sm font-semibold mb-16 transition-colors duration-[var(--motion-fast)] ease-out hover:bg-brand hover:text-brand-foreground"
        >
          Sign in to get started
        </Link>
        <ul className="inline-grid grid-cols-2 gap-x-8 gap-y-4">
          {FEATURES.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.14em] font-label text-muted">
              <Icon size={15} strokeWidth={2} aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </div>
      <CovenantWorksCredit className="absolute bottom-8 right-8" />
    </div>
  )
}
