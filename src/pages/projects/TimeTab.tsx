import { Clock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useProjectTime } from '@/api/projects'
import { useTickets } from '@/api/tickets'
import type { ProjectSummary, TimeEntry, User } from '@/api/types'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { DataTable, TableSkeleton, type Column } from '@/components/ui/DataTable'
import { QueryError } from '@/components/ui/QueryError'
import { formatDate, formatMoney, formatTime } from '@/lib/format'
import { entryHours } from '@/lib/hours'
import { AddTimeSheet } from '@/pages/time/AddTimeSheet'
import { totalsByPerson } from './timeTotals'

const tenth = (n: number) => Math.round(n * 10) / 10

/** Time logged on the project: totals per person, then every entry, newest first. Cost for admins only; "Add time" logs your own. */
export function TimeTab({ project, people }: { project: ProjectSummary; people: User[] }) {
  const time = useProjectTime(project.id)
  const tasks = useTickets(project.id).data ?? []
  const now = useMemo(() => new Date(), [])
  const [adding, setAdding] = useState(false)
  const addBar = (
    <div className="mb-4 flex justify-end">
      <Button variant="secondary" onClick={() => setAdding(true)}>
        <Clock className="size-4" /> Add time
      </Button>
      {adding && <AddTimeSheet projectId={project.id} onClose={() => setAdding(false)} />}
    </div>
  )

  if (time.isError) return <QueryError what="Time" onRetry={() => void time.refetch()} />
  if (time.isPending) return <TableSkeleton rows={6} />

  const { entries, rates } = time.data
  if (entries.length === 0)
    return (
      <>
        {addBar}
        <p className="rounded-xl border border-dashed border-line-strong p-10 text-center text-sm text-fg-secondary">No time logged yet.</p>
      </>
    )

  const nameOf = (id: string) => people.find((u) => u.id === id)?.name ?? 'Unknown person'
  const taskOf = (id: string | null) => (id ? tasks.find((t) => t.id === id) : undefined)
  const rateOf = (userId: string) => rates?.find((r) => r.userId === userId)?.hourlyCost ?? 0
  const totals = totalsByPerson(entries, rates, now)

  const columns: Column<TimeEntry>[] = [
    {
      id: 'person',
      header: 'Person',
      width: 180,
      cell: (e) => (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar name={nameOf(e.userId)} size="sm" />
          <span className="truncate text-fg">{nameOf(e.userId)}</span>
        </span>
      ),
    },
    {
      id: 'task',
      header: 'Task',
      width: 260,
      cell: (e) => {
        const t = taskOf(e.taskId)
        return <span className="block truncate text-fg-secondary">{t ? `${t.key} · ${t.title}` : '—'}</span>
      },
    },
    { id: 'day', header: 'Day', width: 120, cell: (e) => <span className="tabular-nums text-fg-secondary">{formatDate(e.startedAt)}</span> },
    {
      id: 'span',
      header: 'Start – end',
      width: 150,
      cell: (e) => <span className="tabular-nums text-fg-secondary">{formatTime(e.startedAt)} – {e.endedAt ? formatTime(e.endedAt) : 'running'}</span>,
    },
    { id: 'hours', header: 'Hours', width: 80, align: 'right', cell: (e) => <span className="tabular-nums text-fg">{tenth(entryHours(e, now))}h</span> },
    ...(rates
      ? [{ id: 'cost', header: 'Cost', width: 120, align: 'right' as const, cell: (e: TimeEntry) => <span className="tabular-nums text-fg-secondary">{formatMoney(Math.round(entryHours(e, now) * rateOf(e.userId)))}</span> }]
      : []),
  ]

  return (
    <div className="space-y-5">
      {addBar}
      <Card>
        <CardHeader title={`${totals.hours}h logged${totals.cost !== null ? ` · ${formatMoney(totals.cost)}` : ''}`} />
        <ul className="divide-y divide-line-subtle px-5">
          {totals.people.map((p) => (
            <li key={p.userId} className="flex items-center gap-3 py-2.5">
              <Avatar name={nameOf(p.userId)} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{nameOf(p.userId)}</span>
              <span className="text-sm tabular-nums text-fg-secondary">{p.hours}h</span>
              {p.cost !== null && <span className="w-28 text-end text-sm tabular-nums text-fg-muted">{formatMoney(p.cost)}</span>}
            </li>
          ))}
        </ul>
      </Card>

      <div className="max-sm:hidden">
        <DataTable columns={columns} rows={entries} rowKey={(e) => e.id} storageKey="spark-flow.table.time" label="Time entries" />
      </div>
      <ul className="divide-y divide-line-subtle overflow-hidden rounded-xl border border-line bg-surface sm:hidden">
        {entries.map((e) => {
          const t = taskOf(e.taskId)
          return (
            <li key={e.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={nameOf(e.userId)} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg">{t ? `${t.key} · ${t.title}` : nameOf(e.userId)}</span>
                <span className="block truncate text-xs text-fg-muted">
                  {nameOf(e.userId)} · {formatDate(e.startedAt)} · {formatTime(e.startedAt)} – {e.endedAt ? formatTime(e.endedAt) : 'running'}
                </span>
              </span>
              <span className="text-sm tabular-nums text-fg">{tenth(entryHours(e, now))}h</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
