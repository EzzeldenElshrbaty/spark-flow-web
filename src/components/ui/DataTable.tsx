import clsx from 'clsx'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { nextColumnSort, type ColumnSort, type SortKind } from '@/lib/sorting'

export type Column<T> = {
  id: string
  header: string
  /** Starting width in px; people can drag it wider or narrower. */
  width: number
  minWidth?: number
  align?: 'left' | 'right'
  /** Makes the header sortable; says how its values read (for the phone Sort menu). Leave out for action columns. */
  sort?: SortKind
  cell: (row: T) => ReactNode
}

const KEYBOARD_STEP = 16

function readWidths(storageKey: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<string, number>
  } catch {
    // Storage unavailable or corrupt: start from the defaults.
    return {}
  }
}

function saveWidths(storageKey: string, widths: Record<string, number>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(widths))
  } catch {
    // Ignore: the widths just won't survive a reload.
  }
}

/**
 * A table with resizable columns (drag a header's right edge, or focus it and use the arrow keys;
 * double-click resets), sortable headers (ascending, descending, then back to the default order) and clickable rows. Widths are remembered per browser under
 * `storageKey`. If the columns are wider than the screen, the table scrolls sideways inside its box.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  sort,
  onSort,
  storageKey,
  animateKey,
  label,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  sort?: ColumnSort | null
  /** Called with the next sort when a header is clicked; null means the list's default order. */
  onSort?: (sort: ColumnSort | null) => void
  storageKey: string
  /** Changing this replays the rows' entrance (e.g. on a new page). */
  animateKey?: string
  label: string
}) {
  const [widths, setWidths] = useState<Record<string, number>>(() => readWidths(storageKey))
  const widthOf = (column: Column<T>) => widths[column.id] ?? column.width
  const total = columns.reduce((sum, column) => sum + widthOf(column), 0)

  const resize = (column: Column<T>, width: number, persist: boolean) => {
    const next = { ...widths, [column.id]: Math.max(column.minWidth ?? 80, Math.round(width)) }
    setWidths(next)
    if (persist) saveWidths(storageKey, next)
  }
  const reset = (column: Column<T>) => {
    const next = { ...widths }
    delete next[column.id]
    setWidths(next)
    saveWidths(storageKey, next)
  }

  const startDrag = (column: Column<T>, event: PointerEvent<HTMLSpanElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = widthOf(column)
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    let latest = startWidth
    const move = (moveEvent: globalThis.PointerEvent) => {
      latest = startWidth + moveEvent.clientX - startX
      resize(column, latest, false)
    }
    const up = () => {
      resize(column, latest, true)
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }

  const onHandleKey = (column: Column<T>, event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      resize(column, widthOf(column) + (event.key === 'ArrowRight' ? KEYBOARD_STEP : -KEYBOARD_STEP), true)
    }
  }

  return (
    <div className="overflow-x-auto border border-line bg-surface">
      <table className="table-fixed border-collapse text-sm" style={{ width: total, minWidth: '100%' }} aria-label={label}>
        <colgroup>
          {columns.map((column) => (
            <col key={column.id} style={{ width: widthOf(column) }} />
          ))}
        </colgroup>
        <thead className="bg-surface-sunken">
          <tr className="border-b border-line">
            {columns.map((column) => {
              const sorted = sort?.by === column.id ? sort.dir : null
              const SortIcon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown
              return (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                  className={clsx('relative select-none px-4 py-2.5 text-xs font-medium text-fg-muted', column.align === 'right' ? 'text-end' : 'text-start')}
                >
                  {column.sort && onSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(nextColumnSort(sort ?? null, column.id))}
                      title={sorted === 'desc' ? 'Back to the default order' : sorted === 'asc' ? 'Sort descending' : 'Sort ascending'}
                      className={clsx('group inline-flex max-w-full items-center gap-1 hover:text-fg', column.align === 'right' && 'flex-row-reverse', sorted && 'text-fg')}
                    >
                      <span className="truncate">{column.header}</span>
                      <SortIcon className={clsx('size-3.5 shrink-0 transition-opacity', sorted ? 'opacity-100' : 'opacity-0 group-hover:opacity-60')} />
                    </button>
                  ) : (
                    <span className="block truncate">{column.header}</span>
                  )}
                  {/* Resize handle on the column's right border. */}
                  <span
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${column.header} column`}
                    aria-valuenow={widthOf(column)}
                    tabIndex={0}
                    onPointerDown={(event) => startDrag(column, event)}
                    onKeyDown={(event) => onHandleKey(column, event)}
                    onDoubleClick={() => reset(column)}
                    title="Drag to resize · double-click to reset"
                    className="group/handle absolute -end-1.5 top-0 z-10 flex h-full w-3 cursor-col-resize touch-none justify-center focus-visible:outline-none"
                  >
                    <span className="h-full w-px bg-line transition-colors group-hover/handle:w-0.5 group-hover/handle:bg-brand-500 group-focus-visible/handle:w-0.5 group-focus-visible/handle:bg-brand-500" />
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody key={animateKey} className="divide-y divide-line-subtle">
          {rows.map((row, index) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={clsx('transition-colors motion-safe:animate-fade-in', onRowClick && 'cursor-pointer hover:bg-surface-sunken')}
              style={{ animationDelay: `${Math.min(index, 15) * 18}ms` }}
            >
              {columns.map((column) => (
                <td key={column.id} className={clsx('overflow-hidden px-4 py-3 align-middle', column.align === 'right' && 'text-end')}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Placeholder rows while the first page loads. */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden border border-line bg-surface" aria-hidden>
      <div className="h-10 border-b border-line bg-surface-sunken" />
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex animate-pulse items-center gap-4 border-b border-line-subtle px-4 py-3.5 last:border-0">
          <span className="size-8 rounded-full bg-surface-strong" />
          <span className="h-3 w-40 rounded bg-surface-strong" />
          <span className="h-3 w-20 rounded-full bg-surface-muted" />
          <span className="ms-auto h-3 w-24 rounded bg-surface-muted" />
        </div>
      ))}
    </div>
  )
}
