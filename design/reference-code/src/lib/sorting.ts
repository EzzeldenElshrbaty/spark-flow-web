// Column sorting for the data tables. The list APIs take it as a column id plus a direction, the way the .NET
// API will (e.g. ?by=company&dir=asc), and sort every matching record before paging.

export type SortDir = 'asc' | 'desc'
export type ColumnSort = { by: string; dir: SortDir }

/** How a column's values read, so the phone Sort menu can say "A to Z", "Low to high" or "Earliest first". `order`: a fixed sequence, like pipeline stages. */
export type SortKind = 'text' | 'number' | 'date' | 'order'

export type SortValue = string | number | null | undefined
/** For each sortable column id, the value the server sorts that column by. */
export type SortKeys<T> = Record<string, (row: T) => SortValue>

const dirs: readonly SortDir[] = ['asc', 'desc']

/** The column sort in the URL (`by` and `dir`). The API ignores a column it can't sort by. */
export function columnSortFrom(params: URLSearchParams): ColumnSort | null {
  const by = params.get('by')
  if (!by) return null
  const dir = params.get('dir')
  return { by, dir: dirs.includes(dir as SortDir) ? (dir as SortDir) : 'asc' }
}

/** URL changes for a new column sort; null goes back to the list's default order. */
export const sortParams = (sort: ColumnSort | null) => ({ by: sort?.by ?? null, dir: sort?.dir ?? null })

/** Clicking a header: ascending first, then descending, then back to the default order. */
export function nextColumnSort(current: ColumnSort | null, column: string): ColumnSort | null {
  if (current?.by !== column) return { by: column, dir: 'asc' }
  return current.dir === 'asc' ? { by: column, dir: 'desc' } : null
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })
const isEmpty = (value: SortValue) => value === null || value === undefined || value === ''

/**
 * Sorts rows in place by one column. Rows without a value always go last, whichever way it sorts; ties keep the
 * order they came in (the list's default order), since Array.prototype.sort is stable.
 */
export function sortByColumn<T>(rows: T[], sort: ColumnSort | null | undefined, keys: SortKeys<T>) {
  const key = sort && keys[sort.by]
  if (!key) return rows
  const sign = sort.dir === 'asc' ? 1 : -1
  return rows.sort((a, b) => {
    const left = key(a)
    const right = key(b)
    if (isEmpty(left) || isEmpty(right)) return Number(isEmpty(left)) - Number(isEmpty(right))
    const order = typeof left === 'number' && typeof right === 'number' ? left - right : collator.compare(String(left), String(right))
    return order * sign
  })
}

/** What each direction is called in the phone Sort menu. */
export const directionLabels: Record<SortKind, Record<SortDir, string>> = {
  text: { asc: 'A to Z', desc: 'Z to A' },
  number: { asc: 'Low to high', desc: 'High to low' },
  date: { asc: 'Earliest first', desc: 'Latest first' },
  order: { asc: 'First to last', desc: 'Last to first' },
}
