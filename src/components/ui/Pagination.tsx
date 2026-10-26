import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { selectClass } from './Field'
import { pageSizes } from './styles'

/** Page numbers with ellipses: 1 … 4 5 6 … 50. */
function pageList(page: number, pageCount: number): (number | '…')[] {
  const pages = [...new Set([1, pageCount, page - 1, page, page + 1])].filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b)
  const result: (number | '…')[] = []
  pages.forEach((value, index) => {
    if (index > 0 && value - pages[index - 1] > 1) result.push('…')
    result.push(value)
  })
  return result
}

export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number
  pageCount: number
  pageSize: number
  total: number
  onPage: (page: number) => void
  onPageSize: (size: number) => void
}) {
  const number = new Intl.NumberFormat('en-US')
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  const arrow = 'inline-flex size-9 items-center justify-center rounded-lg border border-line text-fg-tertiary transition-colors hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-40'
  return (
    <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm" aria-label="Pagination">
      <p className="text-fg-muted">
        Showing{' '}
        <span className="font-medium text-fg">
          {number.format(from)}–{number.format(to)}
        </span>{' '}
        of <span className="font-medium text-fg">{number.format(total)}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <button type="button" className={arrow} onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </button>
        {/* Phones get a compact "Page 3 of 50"; wider screens get page numbers. */}
        <span className="px-2 text-fg-secondary sm:hidden">
          Page {page} of {pageCount}
        </span>
        <span className="hidden items-center gap-1 sm:flex">
          {pageList(page, pageCount).map((item, index) =>
            item === '…' ? (
              <span key={`gap-${index}`} className="px-1 text-fg-subtle">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPage(item)}
                aria-current={item === page ? 'page' : undefined}
                className={clsx('min-w-9 rounded-lg px-2 py-1.5 tabular-nums transition-colors', item === page ? 'bg-brand-500 font-medium text-white' : 'text-fg-secondary hover:bg-surface-muted')}
              >
                {item}
              </button>
            ),
          )}
        </span>
        <button type="button" className={arrow} onClick={() => onPage(page + 1)} disabled={page >= pageCount} aria-label="Next page">
          <ChevronRight className="size-4" />
        </button>
        <div className="ml-1 w-28 shrink-0">
          <select className={clsx(selectClass, 'py-1.5')} value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))} aria-label="Rows per page">
            {pageSizes.map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
        </div>
      </div>
    </nav>
  )
}

