import { Play } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useMarkMentionsRead, useMyMentions } from '@/api/mentions'
import { useProjectSummaries } from '@/api/projects'
import { useWorkspaces } from '@/api/workspaces'
import { useArchivedTasksOf, useTasksOf } from '@/api/tickets'
import { taskLabel } from '@/lib/taskLabel'
import { useMyDay, useStartTimer } from '@/api/time'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { QueryError } from '@/components/ui/QueryError'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { formatDate, timeAgo } from '@/lib/format'
import { withInspector } from '@/lib/inspector'
import { mentionLink } from '@/lib/mentionLink'
import { timerForTask } from '@/lib/hours'
import { useNow } from '@/lib/useNow'
import { useRole } from '@/lib/useRole'
import { loggableTasks, myOpenTasks } from '@/pages/projects/taskFilters'
import { useCanLog } from '@/lib/useCanLog'
import { OverduePill, TicketKey } from '@/pages/projects/ticketPills'
import { TodayCard } from './TodayCard'
import { dueTodayOrOverdue, greeting } from './myDay'

/** Home / My day: my timer and today's time, then what is due today or overdue for me. */
export function HomePage() {
  const { workspace } = useCurrentWorkspace()
  const { persona } = useRole()
  const day = useMyDay()
  const projects = useProjectSummaries(workspace?.id)
  const workspaces = useWorkspaces()
  const tasks = useTasksOf((projects.data ?? []).map((p) => p.id))
  const archived = useArchivedTasksOf((projects.data ?? []).map((p) => p.id))
  const start = useStartTimer()
  const [params] = useSearchParams()
  const now = useNow(60_000)
  const mentions = useMyMentions(Boolean(persona.id))
  const markRead = useMarkMentionsRead()
  const navigate = useNavigate()

  const all = tasks.data
  const mine = myOpenTasks(all, persona.id)
  // Pickers and Start offer only tasks the server lets me log on: assigned isn't enough once I'm off the project.
  const canLog = useCanLog()
  const loggable = loggableTasks(mine, (id) => canLog(projects.data?.find((p) => p.id === id)))
  const due = dueTodayOrOverdue(all, persona.id, now)
  const overdue = mine.filter((t) => t.overdue).length
  const overEstimate = mine.filter((t) => t.overEstimate).length
  const projectName = (id: string) => projects.data?.find((p) => p.id === id)?.name ?? '—'
  const label = (taskId: string | null, projectId: string) => {
    // Archived tasks keep their time, so today's entries still name them.
    const t = taskId ? (all.find((x) => x.id === taskId) ?? archived.find((x) => x.id === taskId)) : undefined
    return t ? taskLabel(t) : projectName(projectId)
  }
  const subtitle = mine.length
    ? `${mine.length} open ${mine.length === 1 ? 'task' : 'tasks'} · ${overdue} overdue${overEstimate ? ` · ${overEstimate} over estimate` : ''}`
    : 'Nothing assigned to you.'
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
            <TodayCard day={day.data} label={label} />
          )}
        </div>
        <div className="min-w-0 space-y-5">
          <Card>
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
                    {!timerForTask(day.data?.timer, t.id) && loggable.includes(t) && (
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
          <Card>
            <CardHeader title="Mentions" />
            {mentions.isError ? (
              <div className="p-5">
                <QueryError what="Mentions" onRetry={() => void mentions.refetch()} />
              </div>
            ) : mentions.isPending ? (
              <div className="m-5 h-24 animate-pulse rounded-lg bg-surface-muted" aria-hidden />
            ) : mentions.data.length === 0 ? (
              <p className="p-5 text-sm text-fg-muted">No mentions yet.</p>
            ) : (
              <ul className="divide-y divide-line-subtle">
                {mentions.data.slice(0, 5).map((m) => {
                  const author = m.authorName
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!m.read) markRead.mutate([m.id])
                          navigate(mentionLink(m, workspaces.data ?? [], workspace?.slug ?? ''))
                        }}
                        className="flex w-full items-start gap-3 px-5 py-3 text-start hover:bg-surface-muted"
                      >
                        <Avatar name={author} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className={m.read ? 'block truncate text-sm text-fg-secondary' : 'block truncate text-sm font-semibold text-fg'}>
                            {author} · {timeAgo(m.createdAt)}
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-xs text-fg-muted">{m.excerpt}</span>
                        </span>
                        {!m.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-brand-500" aria-label="Unread" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
