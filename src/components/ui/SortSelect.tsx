import clsx from 'clsx'
import { directionLabels, type ColumnSort, type SortKind } from '../../lib/sorting'
import { selectClass } from './Field'

type Option = { value: string; label: string }

/**
 * The list's order as one menu: its default order(s) first, then every sortable column both ways. Phones use it
 * in place of the table headers; on wider screens it follows whatever header was clicked.
 */
export function SortSelect({
  columns,
  sort,
  onChange,
  defaults = [{ value: '', label: 'Default order' }],
  defaultValue = '',
  className,
}: {
  columns: { id: string; header: string; sort?: SortKind }[]
  sort: ColumnSort | null
  /** A column sort, or null with the default order picked (one of `defaults`). */
  onChange: (sort: ColumnSort | null, defaultValue?: string) => void
  /** The list's own orders (e.g. "Needs attention first"); picking one clears the column sort. */
  defaults?: Option[]
  defaultValue?: string
  className?: string
}) {
  const columnOptions = columns.flatMap((column) =>
    column.sort ? (['asc', 'desc'] as const).map((dir) => ({ value: `${column.id}:${dir}`, label: `${column.header}: ${directionLabels[column.sort!][dir]}` })) : [],
  )
  const columnValue = sort && `${sort.by}:${sort.dir}`
  const value = columnValue && columnOptions.some((option) => option.value === columnValue) ? columnValue : `default:${defaultValue}`

  return (
    <select
      className={clsx(selectClass, className)}
      value={value}
      onChange={(event) => {
        const picked = event.target.value
        if (picked.startsWith('default:')) return onChange(null, picked.slice('default:'.length))
        const [by, dir] = picked.split(':')
        onChange({ by, dir: dir === 'desc' ? 'desc' : 'asc' })
      }}
      aria-label="Sort"
    >
      {defaults.map((option) => (
        <option key={option.value} value={`default:${option.value}`}>
          {option.label}
        </option>
      ))}
      <optgroup label="By column">
        {columnOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </optgroup>
    </select>
  )
}
