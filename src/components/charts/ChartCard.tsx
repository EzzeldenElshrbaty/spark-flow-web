import clsx from 'clsx'
import { ChartColumnBig, Table2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import type { ChartTableData } from '@/components/charts/chartUtils'

export type LegendItem = { label: string; color: string; kind?: 'bar' | 'line' | 'dashed' | 'tick' }

/** A chart in a card: title, optional legend, and a switch to read the same data as a table. */
export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  action,
  className,
  children,
}: {
  title: string
  subtitle?: string
  legend?: LegendItem[]
  table?: ChartTableData
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  const [asTable, setAsTable] = useState(false)
  return (
    <Card className={clsx('flex min-w-0 flex-col motion-safe:animate-fade-up', className)}>
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {table && (
            <button
              type="button"
              onClick={() => setAsTable((value) => !value)}
              aria-pressed={asTable}
              title={asTable ? 'View as chart' : 'View as table'}
              aria-label={asTable ? 'View as chart' : 'View as table'}
              className="-me-1.5 rounded-md p-1.5 text-fg-muted transition hover:bg-surface-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-brand-500 dark:focus-visible:outline-brand-400"
            >
              {asTable ? <ChartColumnBig className="size-4" /> : <Table2 className="size-4" />}
            </button>
          )}
        </div>
      </div>
      {legend && !asTable && <Legend items={legend} />}
      <div className="flex-1 px-5 pt-3 pb-5">{asTable && table ? <ChartTable table={table} /> : children}</div>
    </Card>
  )
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 px-5 pt-2 text-xs text-fg-tertiary">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <LegendSwatch color={item.color} kind={item.kind} />
          {item.label}
        </li>
      ))}
    </ul>
  )
}

function LegendSwatch({ color, kind = 'bar' }: { color: string; kind?: LegendItem['kind'] }) {
  if (kind === 'line') return <span className="h-0.5 w-3.5 rounded-full" style={{ background: color }} />
  if (kind === 'dashed') return <span className="h-0 w-3.5 border-t-2 border-dashed" style={{ borderColor: color }} />
  if (kind === 'tick') return <span className="h-3 w-0.5 rounded-full" style={{ background: color }} />
  return <span className="size-2.5 rounded-sm" style={{ background: color }} />
}

function ChartTable({ table }: { table: ChartTableData }) {
  return (
    <div className="max-h-72 overflow-auto">
      <table className="w-full text-start text-xs">
        <thead className="sticky top-0 bg-surface text-fg-muted">
          <tr>
            {table.columns.map((column, index) => (
              <th key={column} scope="col" className={clsx('border-b border-line py-2 font-medium', index > 0 && 'text-end')}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-subtle">
          {table.rows.map((row) => (
            <tr key={String(row[0])}>
              {row.map((cell, index) => (
                <td key={index} className={clsx('py-1.5', index === 0 ? 'text-fg-secondary' : 'text-end tabular-nums text-fg')}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
