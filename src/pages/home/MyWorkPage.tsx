import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router'
import { useMarkMentionsRead, useMyMentions } from '@/api/mentions'
import { useProjectSummaries } from '@/api/projects'
import { useWorkspaces } from '@/api/workspaces'
import { useArchivedTasksOf, useTasksOf } from '@/api/tickets'
import { taskLabel } from '@/lib/taskLabel'
import { useMyDay, useStartTimer } from '@/api/time'
import { Avatar } from '@/components/ui/Avatar'
import { Card, CardHeader } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { QueryError } from '@/components/ui/QueryError'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { timeAgo } from '@/lib/format'
import { mentionLink } from '@/lib/mentionLink'
import { paths } from '@/lib/paths'
import { useNow } from '@/lib/useNow'
import { useRole } from '@/lib/useRole'
import { loggableTasks, myOpenTasks } from '@/pages/projects/taskFilters'
import { useCanLog } from '@/lib/useCanLog'
import { TodayCard } from './TodayCard'
import { MyTasksCard } from './MyTasksCard'
import { greeting } from './myDay'

/**
 * My work (UX Phase 2, 2.1: Home and My tasks in one): my timer and today's time, every open task of mine with Start,
 * and the latest mentions of me with a way to see them all. It is the workspace's own page; the Dashboard stays
 * everyone's start page.
 */
export function MyWorkPage() {
  const { workspace } = useCurrentWorkspace()
  const { persona } = useRole()
  const day = useMyDay()
  const projects = useProjectSummaries(workspace?.id)
  const workspaces = useWorkspaces()
  const tasks = useTasksOf((projects.data ?? []).map((p) => p.id))
  const archived = useArchivedTasksOf((projects.data ?? []).map((p) => p.id))
  const start = useStartTimer()
  const now = useNow(60_000)
  const mentions = useMyMentions(Boolean(persona.id))
  const markRead = useMarkMentionsRead()
  const navigate = useNavigate()

  const all = tasks.data
  const mine = myOpenTasks(all, persona.id)
  // Pickers and Start offer only tasks the server lets me log on: assigned isn't enough once I'm off the project.
  const canLog = useCanLog()
  const loggable = loggableTasks(mine, (id) => canLog(projects.data?.find((p) => p.id === id)))
  const overdue = mine.filter((t) => t.overdue).length
  const overEstimate = mine.filter((t) => t.overEstimate).length
  const projectName = (id: string) => projects.data?.find((p) => p.id === id)?.name ?? '—'
  const label = (taskId: string | null, projectId: string) => {
    // Archived tasks keep their time, so today's entries still name them.
    const t = taskId ? (all.find((x) => x.id === taskId) ?? archived.find((x) => x.id === taskId)) : undefined
    return t ? taskLabel(t) : projectName(projectId)
  }
  const hello = persona.name ? greeting(now, persona.name) : ''
  const counts = mine.length ? `${mine.length} open ${mine.length === 1 ? 'task' : 'tasks'} · ${overdue} overdue${overEstimate ? ` · ${overEstimate} over estimate` : ''}` : ''
  const subtitle = [hello, counts].filter(Boolean).join(' · ') || undefined
  // The bell also lists task news (UX Phase 2, 2.3); this card keeps to mentions of me.
  const mentionsOnly = (mentions.data ?? []).filter((m) => m.source === 'message' || m.source === 'reply' || m.source === 'comment')
  const loading = day.isPending || projects.isPending || tasks.isPending

  return (
    <>
      <PageHeader title="My work" subtitle={loading ? undefined : subtitle} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          {day.isError ? (
            <QueryError what="Your day" onRetry={() => void day.refetch()} />
          ) : loading ? (
            <div className="h-72 animate-pulse rounded-xl bg-surface-muted" aria-hidden />
          ) : (
            <TodayCard day={day.data} label={label} />
          )}
          {projects.isError || tasks.isError ? (
            <QueryError what="Tasks" onRetry={() => (projects.isError ? void projects.refetch() : tasks.refetch())} />
          ) : loading ? (
            <div className="h-40 animate-pulse rounded-xl bg-surface-muted" aria-hidden />
          ) : (
            <MyTasksCard
              ws={workspace?.slug ?? ''}
              tasks={mine}
              loggable={loggable}
              timer={day.data?.timer}
              projects={projects.data ?? []}
              assigneeName={persona.name || null}
              onStart={(taskId) => start.mutate({ taskId })}
              starting={start.isPending}
            />
          )}
          {start.error && <p className="text-sm text-red-600 dark:text-red-400">{(start.error as Error).message}</p>}
        </div>
        <div className="min-w-0 space-y-5">
          <section aria-label="Mentions">
            <Card>
              <CardHeader
                title="Mentions"
                action={
                  <Link to={paths.activity(workspace?.slug ?? '')} className="text-sm font-medium text-accent hover:text-accent-strong">
                    See all
                  </Link>
                }
              />
              {mentions.isError ? (
                <div className="p-5">
                  <QueryError what="Mentions" onRetry={() => void mentions.refetch()} />
                </div>
              ) : mentions.isPending ? (
                <div className="m-5 h-24 animate-pulse rounded-lg bg-surface-muted" aria-hidden />
              ) : mentionsOnly.length === 0 ? (
                <p className="p-5 text-sm text-fg-muted">No mentions yet.</p>
              ) : (
                <ul className="divide-y divide-line-subtle">
                  {mentionsOnly.slice(0, 5).map((m) => {
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
          </section>
        </div>
      </div>
    </>
  )
}

/** Old My tasks addresses (`/w/:ws/tasks`) open My work, keeping their query (UX Phase 2, 2.1). */
export function MyTasksRedirect() {
  const { ws = '' } = useParams()
  const { search } = useLocation()
  return <Navigate to={`${paths.home(ws)}${search}`} replace />
}
