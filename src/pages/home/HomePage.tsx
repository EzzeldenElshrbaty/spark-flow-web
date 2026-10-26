import { Play } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { useProjectSummaries } from '@/api/projects'
import { useTasksOf } from '@/api/tickets'
import { useMyDay, useStartTimer } from '@/api/time'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { QueryError } from '@/components/ui/QueryError'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { formatDate } from '@/lib/format'
import { withInspector } from '@/lib/inspector'
import { useNow } from '@/lib/useNow'
import { useRole } from '@/lib/useRole'
import { myOpenTasks } from '@/pages/projects/taskFilters'
import { OverduePill, TicketKey } from '@/pages/projects/ticketPills'
import { CheckInCard } from './CheckInCard'
import { dueTodayOrOverdue, greeting } from './myDay'

/** Home / My day: check in and the running timer, then what is due today or overdue for me. */
export function HomePage() {
  const { workspace } = useCurrentWorkspace()
  const { persona } = useRole()
  const day = useMyDay()
  const projects = useProjectSummaries(workspace?.id)
  const tasks = useTasksOf((projects.data ?? []).map((p) => p.id))
  const start = useStartTimer()
  const [params] = useSearchParams()
  const now = useNow(60_000)

  const all = tasks.data
  const mine = myOpenTasks(all, persona.id)
  const due = dueTodayOrOverdue(all, persona.id, now)
  const overdue = mine.filter((t) => t.overdue).length
  const projectName = (id: string) => projects.data?.find((p) => p.id === id)?.name ?? '—'
  const label = (taskId: string | null, projectId: string) => {
    const t = taskId ? all.find((x) => x.id === taskId) : undefined
    return t ? `${t.key} · ${t.title}` : projectName(projectId)
  }
  const subtitle = mine.length ? `${mine.length} open ${mine.length === 1 ? 'task' : 'tasks'} · ${overdue} overdue` : 'Nothing assigned to you.'
  const loading = day.isPending || projects.isPending || tasks.isPending

  return (
    <>
      <PageHeader title={persona.name ? greeting(now, persona.name) : 'Home'} subtitle={loading ? undefined : subtitle} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          {day.isError ? (
            <QueryError what="Your day" onRetry={() => void day.refetch()} />
          ) : loading ? (
            <div className="h-72 animate-pulse rounded-xl bg-surface-muted" aria-hidden />
          ) : (
            <CheckInCard day={day.data} tasks={mine} label={label} />
          )}
        </div>
        <Card className="min-w-0">
          <CardHeader title="Due today and overdue" />
          {projects.isError || tasks.isError ? (
            <div className="p-5">
              <QueryError what="Tasks" onRetry={() => (projects.isError ? void projects.refetch() : tasks.refetch())} />
            </div>
          ) : loading ? (
            <div className="m-5 h-40 animate-pulse rounded-lg bg-surface-muted" aria-hidden />
          ) : due.length === 0 ? (
            <p className="p-5 text-sm text-fg-muted">Nothing due today.</p>
          ) : (
            <ul className="divide-y divide-line-subtle">
              {due.map((t) => (
                <li key={t.id} className="flex items-center gap-2 px-5 py-3">
                  <Link to={{ search: withInspector(params, { kind: 'ticket', key: t.key }).toString() }} className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <TicketKey value={t.key} className="text-fg-muted" />
                      {t.overdue && <OverduePill />}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-fg hover:underline">{t.title}</span>
                    <span className="block truncate text-xs text-fg-muted">
                      {projectName(t.projectId)} · {t.dueAt ? formatDate(t.dueAt) : '—'}
                    </span>
                  </Link>
                  {day.data?.running?.taskId !== t.id && (
                    <Button variant="ghost" onClick={() => start.mutate({ taskId: t.id })} disabled={start.isPending} aria-label={`Start timer on ${t.key}`}>
                      <Play className="size-4" /> Start
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {start.error && <p className="px-5 pb-3 text-sm text-red-600 dark:text-red-400">{(start.error as Error).message}</p>}
        </Card>
      </div>
    </>
  )
}
