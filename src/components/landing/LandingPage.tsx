import Link from 'next/link'
import ParableMark from '@/components/brand/ParableMark'
import CovenantWorksCredit from '@/components/brand/CovenantWorksCredit'
import { buttonClass } from '@/components/ui/Button'

const POINTS = [
  'Every headline in English',
  'The last 12 hours, nothing older',
  'Summaries only when you ask',
]

export default function LandingPage() {
  return (
    <div className="flex min-h-[calc(100dvh-57px)] flex-col">
      <div className="animate-landing-reveal mx-auto flex w-full max-w-2xl flex-1 flex-col items-start justify-center px-4 py-16 min-[640px]:px-8">
        <ParableMark size={96} tone="accent" drawIn />
        <h1 className="mt-8 text-[length:var(--text-3xl)] leading-[var(--leading-tight)] tracking-[var(--tracking-display)]">
          Parable
        </h1>
        <p className="mt-3 max-w-[40ch] text-lg text-foreground-muted">
          Everything important about your countries and topics from the last 12 hours, in about two
          minutes.
        </p>
        <ul className="mt-8 space-y-2">
          {POINTS.map((point) => (
            <li key={point} className="cw-eyebrow">
              {point}
            </li>
          ))}
        </ul>
        <Link href="/login" className={`${buttonClass({ variant: 'primary', size: 'lg' })} mt-10`}>
          Sign in
        </Link>
      </div>
      <CovenantWorksCredit className="border-t border-border px-4 py-4 min-[640px]:px-8" />
    </div>
  )
}
