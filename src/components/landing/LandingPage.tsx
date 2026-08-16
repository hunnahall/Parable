import Link from 'next/link'
import { Rss, LineChart, LayoutGrid, Bookmark } from 'lucide-react'

const FEATURES = [
  { icon: Rss, label: 'Read RSS feeds' },
  { icon: LineChart, label: 'Track economic indicators' },
  { icon: LayoutGrid, label: 'Arrange your dashboard' },
  { icon: Bookmark, label: 'Save what matters' },
]

export default function LandingPage() {
  return (
    <div className="flex flex-col items-center text-center px-8 py-24 max-w-2xl mx-auto">
      <h1 className="text-4xl font-bold mb-4">Parable</h1>
      <p className="text-lg text-muted mb-8">A simple dashboard for feeds and indicators.</p>
      <Link
        href="/login"
        className="rounded border border-border bg-white text-black px-6 py-3 text-sm font-semibold mb-16"
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
  )
}
