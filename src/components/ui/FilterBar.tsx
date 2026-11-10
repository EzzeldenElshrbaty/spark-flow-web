import clsx from 'clsx'
import type { ReactNode } from 'react'

/**
 * A list's controls bar (kit pattern A.3, UX Phase 4): the page's search and filters in one row, and under it how many
 * show — "23 tasks", or with filters on "Showing 6 of 23 tasks · Clear filters". It sticks under the top bar (56 px
 * where the window scrolls, the page's own scroll box from lg) unless `sticky` is false.
 */
export function FilterBar({
  children,
  shown,
  total,
  noun,
  active,
  onClear,
  sticky = true,
}: {
  children: ReactNode
  shown: number
  /** Undefined while the list loads: the count waits rather than saying 0 (UX Phase 6). */
  total: number | undefined
  /** The thing counted, one and many: ['task', 'tasks']. */
  noun: [string, string]
  /** How many filters are on; Clear filters shows while any are. */
  active: number
  onClear: () => void
  sticky?: boolean
}) {
  const word = (n: number | undefined) => (n === 1 ? noun[0] : noun[1])
  return (
    <div className={clsx(sticky ? 'sticky top-14 z-10 -mx-4 mb-3 bg-canvas/95 px-4 pb-3 pt-1 backdrop-blur md:-mx-6 md:px-6 lg:top-0 xl:-mx-8 xl:px-8' : 'mb-3')}>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">{children}</div>
      <p role="status" className="mt-2 text-xs text-fg-muted tabular-nums">
        {total === undefined ? null : active > 0 ? (
          <>
            Showing {shown} of {total} {word(total)} ·{' '}
            <button type="button" onClick={onClear} className="font-medium text-accent hover:underline">
              Clear filters
            </button>
          </>
        ) : (
          `${total} ${word(total)}`
        )}
      </p>
    </div>
  )
}
