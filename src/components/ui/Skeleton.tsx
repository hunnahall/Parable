// Flat --fill-active blocks in the shape of the content. No shimmer; the
// .skeleton class (globals.css) keeps them hidden for the first 300ms.
export default function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}

// The loading shape shared by every list page: a header bar and rows.
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mx-auto flex h-16 max-w-3xl items-center px-4 min-[1000px]:px-8">
        <Skeleton className="h-6 w-32" />
      </div>
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 min-[1000px]:px-8">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  )
}
