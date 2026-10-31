import { Clock } from 'lucide-react'
import { useState } from 'react'
import { useProjectTime } from '@/api/projects'
import { useArchivedTasks, useTickets } from '@/api/tickets'
import type { ProjectSummary, TimeEntry, User } from '@/api/types'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { DataTable, TableSkeleton, type Column } from '@/components/ui/DataTable'
import { QueryError } from '@/components/ui/QueryError'
import { formatDate, formatMoney, formatTime } from '@/lib/format'
import { entryHours } from '@/lib/hours'
import { useNow } from '@/lib/useNow'
import { rateAt } from '@/lib/rates'
import { taskLabel } from '@/lib/taskLabel'
import { useCanLog } from '@/lib/useCanLog'
import { usePermission } from '@/lib/usePermission'
import { useRole } from '@/lib/useRole'
import { AddTimeSheet } from '@/pages/time/AddTimeSheet'
import { EntryRowExtras } from '@/pages/time/EntryRowExtras'
import { emptyTimeText, showPrivacyNote, timeHeading, totalsByPerson } from './timeTotals'

const tenth = (n: number) => Math.round(n * 10) / 10

/** Time logged on the project: totals per person, then every entry, newest first. Cost for admins only; "Add time" logs your own. */
export function TimeTab({ project, people }: { project: ProjectSummary; people: User[] }) {
  const time = useProjectTime(project.id)
  // Archived tasks keep their time, so their rows still name them.
  const archivedTasks = useArchivedTasks(project.id, true).data ?? []
  const tasks = [...(useTickets(project.id).data ?? []), ...archivedTasks]
  const now = useNow(60_000)
  const [adding, setAdding] = useState(false)
  const canLog = useCanLog()(project)
  const { loading } = useRole()
  const check = usePermission()
  const everyone = check('time.seeTeam', { project })
  const addBar = (
    <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
      {showPrivacyNote(everyone, loading) && <p className="me-auto text-sm text-fg-muted">Only you and the project's manager see your entries.</p>}
      {canLog && (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          <Clock className="size-4" /> Add time
        </Button>
      )}
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
        <p className="rounded-xl border border-dashed border-line-strong p-10 text-center text-sm text-fg-secondary">{emptyTimeText(everyone, project.loggedHours)}</p>
      </>
    )

  const nameOf = (id: string) => people.find((u) => u.id === id)?.name ?? 'Unknown person'
  const taskOf = (id: string | null) => (id ? tasks.find((t) => t.id === id) : undefined)
  const costOf = (e: TimeEntry) => Math.round(entryHours(e, now) * (rates ? rateAt(rates, e.userId, e.startedAt) : 0))
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
        return <span className="block truncate text-fg-secondary">{taskLabel(t)}</span>
      },
    },
    { id: 'note', header: 'Note', width: 200, cell: (e) => <span className="block truncate text-fg-muted">{e.note.trim() || '—'}</span> },
    { id: 'day', header: 'Day', width: 120, cell: (e) => <span className="tabular-nums text-fg-secondary">{formatDate(e.startedAt)}</span> },
    {
      id: 'span',
      header: 'Start – end',
      width: 150,
      cell: (e) => <span className="tabular-nums text-fg-secondary">{formatTime(e.startedAt)} – {e.endedAt ? formatTime(e.endedAt) : 'running'}</span>,
    },
    { id: 'hours', header: 'Hours', width: 80, align: 'right', cell: (e) => <span className="tabular-nums text-fg">{tenth(entryHours(e, now))}h</span> },
    ...(rates
      ? [{ id: 'cost', header: 'Cost', width: 120, align: 'right' as const, cell: (e: TimeEntry) => <span className="tabular-nums text-fg-secondary">{formatMoney(costOf(e))}</span> }]
      : []),
    { id: 'actions', header: '', width: 120, align: 'right', cell: (e) => <EntryRowExtras entry={e} compact /> },
  ]

  return (
    <div className="space-y-5">
      {addBar}
      <Card>
        <CardHeader title={timeHeading(everyone, totals, project.loggedHours)} />
        <ul className="divide-y divide-line-subtle px-5">
          {totals.people.map((p) => (
            <li key={p.userId} className="flex items-center gap-3 py-2.5">
              <Avatar name={nameOf(p.userId)} size="sm" />
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{nameOf(p.userId)}</span>
              <span className="text-sm tabular-nums text-fg-secondary">{tenth(p.hours)}h</span>
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
                <span className="block truncate text-sm text-fg">{t ? taskLabel(t) : nameOf(e.userId)}</span>
                <span className="block truncate text-xs text-fg-muted">
                  {nameOf(e.userId)} · {formatDate(e.startedAt)} · {formatTime(e.startedAt)} – {e.endedAt ? formatTime(e.endedAt) : 'running'}
                  {e.note.trim() && ` · ${e.note}`}
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
