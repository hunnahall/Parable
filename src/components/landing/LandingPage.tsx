import Link from 'next/link'
import ParableMark from '@/components/brand/ParableMark'
import CovenantWorksCredit from '@/components/brand/CovenantWorksCredit'
import { buttonClass } from '@/components/ui/Button'

const POINTS = [
  'Every headline in English',
  'The last 12 hours, nothing older',
  'Summaries only when you ask',
]

// Invented stories and feeds for the example panel. None is a real
// publisher or headline, and the panel says EXAMPLE.
const EXAMPLE_STORIES: { feed: string; age: string; read: string; lang?: string; feeds?: number; title: string; seen?: boolean }[] = [
  { feed: 'Northgate Post', age: '1h ago', read: '3 min', feeds: 4, title: 'Central bank holds its main rate for a third month' },
  { feed: 'Le Petit Relais', age: '2h ago', read: '2 min', lang: 'FR', title: 'City council approves a tram line through the old port' },
  { feed: 'Riverside Ledger', age: '3h ago', read: '4 min', lang: 'AR', title: 'Water cuts expected in three southern districts this weekend' },
  { feed: 'Harbor Wire', age: '5h ago', read: '2 min', title: 'Small farms get a solar battery built for dusty fields', seen: true },
]

// A static Inbox, drawn in HTML (no screenshot) so it follows the theme.
function ExampleInbox() {
  return (
    <div className="cw-panel w-full max-w-md" aria-label="An example Inbox" role="img">
      <div className="cw-panel__head">
        <span className="text-sm font-medium">
          Inbox <span className="font-mono text-xs font-normal tabular-nums text-muted">84</span>
        </span>
        <span className="cw-tag">EXAMPLE</span>
      </div>
      <ul className="divide-y divide-border">
        {EXAMPLE_STORIES.map((story) => (
          <li key={story.title} className="px-4 py-3">
            <div className="mb-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>{[story.feed, story.age, story.read].join(' · ')}</span>
              {story.lang && <span className="cw-tag">{story.lang}</span>}
              {story.feeds && <span className="cw-badge">{story.feeds} feeds</span>}
            </div>
            <p className={story.seen ? 'text-foreground-muted' : 'font-semibold'}>{story.title}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function LandingPage() {
  return (
    <div className="flex min-h-[calc(100dvh-57px)] flex-col">
      <div className="animate-landing-reveal mx-auto grid w-full max-w-[var(--content-max)] flex-1 items-center gap-12 px-4 py-16 min-[640px]:px-8 min-[1000px]:grid-cols-[1fr_auto]">
        <div className="flex flex-col items-start">
          <ParableMark size={72} tone="accent" drawIn />
          <h1 className="mt-8 max-w-[14ch] text-[length:var(--text-4xl)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)]">
            The last 12 hours, in two minutes.
          </h1>
          <p className="mt-4 max-w-[44ch] text-lg text-foreground-muted">
            Everything important about your countries and topics from the last 12 hours, every headline in English.
          </p>
          <ul className="mt-8 space-y-2">
            {POINTS.map((point) => (
              <li key={point} className="cw-eyebrow">
                {point}
              </li>
            ))}
          </ul>
          {/* The page's one accent button. */}
          <Link href="/login" className={`${buttonClass({ variant: 'accent', size: 'lg' })} mt-10`}>
            Sign in
          </Link>
        </div>
        <ExampleInbox />
      </div>
      <CovenantWorksCredit className="border-t border-border px-4 py-4 min-[640px]:px-8" />
    </div>
  )
}
