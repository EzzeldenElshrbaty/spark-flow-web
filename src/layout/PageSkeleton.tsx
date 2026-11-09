/**
 * Shown while a page, or what a page needs to decide where to go, is loading: shaped like a page (UX Phase 4, 4.5) —
 * a title, four tiles and a few rows — so the screen doesn't jump from one grey block to something else.
 */
export function PageSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse">
      <div className="h-7 w-48 rounded-lg bg-surface-strong" />
      <div className="mt-2 h-4 w-72 max-w-full rounded bg-surface-muted" />
      <div className="mt-6 mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((tile) => (
          <div key={tile} data-pulse="tile" className="h-20 rounded-xl bg-surface-muted" />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} data-pulse="row" className="flex items-center gap-4 border-b border-line-subtle px-4 py-3.5 last:border-0">
            <span className="h-3 w-40 rounded bg-surface-strong" />
            <span className="h-3 w-20 rounded-full bg-surface-muted" />
            <span className="ms-auto h-3 w-24 rounded bg-surface-muted" />
          </div>
        ))}
      </div>
    </div>
  )
}
