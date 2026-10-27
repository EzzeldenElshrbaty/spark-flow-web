import clsx from 'clsx'
import { Clock, Pencil, Play, Square } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useComments } from '@/api/comments'
import { usePhases } from '@/api/projects'
import { useProjects, useSprints, useTicket, useUpdateTask } from '@/api/tickets'
import { useMyDay, useStartTimer, useStopTimer } from '@/api/time'
import type { TicketStatus } from '@/api/types'
import { useUsers } from '@/api/users'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { selectClass } from '@/components/ui/Field'
import { QueryError } from '@/components/ui/QueryError'
import { InspectorFrame, InspectorSkeleton, TitleSkeleton, type InspectorBodyProps } from '@/layout/InspectorFrame'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { ApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { usePermission } from '@/lib/usePermission'
import { TaskSheet } from '@/pages/projects/TaskSheet'
import { AddTimeSheet } from '@/pages/time/AddTimeSheet'
import { TaskActivity } from '@/pages/projects/TaskActivity'
import { BugPill, OverduePill, PriorityPill, StatusPill, hoursLabel, statuses } from '@/pages/projects/ticketPills'
import { NotFound } from '@/pages/NotFound'
import { isPastDue } from '@/lib/dates'
import { boardColumns, columnLabel } from '@/lib/boardColumns'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-center gap-3 py-2.5">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </div>
  )
}

function Person({ name }: { name: string | null }) {
  if (!name) return <>—</>
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar name={name} size="sm" />
      <span className="truncate">{name}</span>
    </span>
  )
}

/**
 * A task's fields. Opens on any page of the workspace. The project's manager gets "Edit task"; the assignee (and the
 * manager) can change the status right here.
 */
export function TicketInspector({ ticketKey, onClose, closeTo }: { ticketKey: string } & InspectorBodyProps) {
  const { workspace } = useCurrentWorkspace()
  const ticket = useTicket(ticketKey)
  const users = useUsers(workspace?.id)
  const projects = useProjects(workspace?.id)
  const sprints = useSprints(ticket.data?.projectId)
  const phases = usePhases(ticket.data?.projectId)
  const update = useUpdateTask()
  const check = usePermission()
  const [editing, setEditing] = useState(false)
  const [addingTime, setAddingTime] = useState(false)
  const [tab, setTab] = useState<'details' | 'activity'>('details')
  const comments = useComments(ticketKey)
  const myDay = useMyDay()
  const start = useStartTimer()
  const stop = useStopTimer()
  const project = projects.data?.find((p) => p.id === ticket.data?.projectId)
  // A ticket of another workspace's project is not found in this one.
  const foreign = Boolean(ticket.data && projects.data && !projects.data.some((p) => p.id === ticket.data.projectId))

  const eyebrow = (
    <>
      Task · <bdi dir="ltr">{ticketKey}</bdi>
    </>
  )
  const title = foreign ? 'Ticket' : ticket.data && projects.data ? ticket.data.title : ticket.isPending || projects.isLoading ? <TitleSkeleton /> : 'Ticket'

  let body
  if (foreign || (ticket.error instanceof ApiError && ticket.error.status === 404)) body = <NotFound what="ticket" backTo={closeTo} backLabel="Close the ticket" />
  else if (ticket.isError) body = <QueryError what="Ticket" onRetry={() => void ticket.refetch()} />
  else if (projects.isError) body = <QueryError what="Projects" onRetry={() => void projects.refetch()} />
  else if (ticket.isPending || projects.isLoading || users.isLoading) body = <InspectorSkeleton />
  else {
    const t = ticket.data
    const nameOf = (id: string | null) => (id ? (users.data?.find((u) => u.id === id)?.name ?? 'Unknown person') : null)
    const sprint = t.sprintId ? sprints.data?.find((s) => s.id === t.sprintId) : undefined
    const phase = t.phaseId ? phases.data?.find((p) => p.id === t.phaseId) : undefined
    const canManage = project ? check('task.manage', { project }) : false
    const canStatus = project ? check('task.updateOwnStatus', { project, taskAssigneeId: t.assigneeId }) : false
    const details = (
      <>
        {(t.type === 'bug' || t.overdue || canManage) && (
          <div className="mb-3 flex items-center gap-2">
            {t.type === 'bug' && <BugPill />}
            {t.overdue && <OverduePill />}
            {canManage && (
              <Button variant="secondary" className="ms-auto" onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit task
              </Button>
            )}
          </div>
        )}
        <dl className="divide-y divide-line-subtle text-sm">
          <Field label="Status">
            {canStatus ? (
              <select
                className={selectClass}
                aria-label="Status"
                value={t.status}
                disabled={update.isPending}
                onChange={(e) => update.mutate({ key: t.key, patch: { status: e.target.value as TicketStatus } })}
              >
                {(project ? boardColumns(project) : statuses).map((s) => (
                  <option key={s.status} value={s.status}>
                    {s.label}
                  </option>
                ))}
              </select>
            ) : (
              <StatusPill status={t.status} label={project ? columnLabel(project, t.status) : undefined} />
            )}
            {update.error && <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{(update.error as Error).message}</span>}
          </Field>
          <Field label="Type">{t.type === 'bug' ? 'Bug' : 'Task'}</Field>
          <Field label="Phase">{phase?.name ?? '—'}</Field>
          <Field label="Priority">
            <PriorityPill priority={t.priority} />
          </Field>
          <Field label="Assignee">
            <Person name={nameOf(t.assigneeId)} />
          </Field>
          <Field label="Reporter">
            <Person name={nameOf(t.reporterId)} />
          </Field>
          <Field label="Due">
            <span className={t.dueAt && t.status !== 'done' && isPastDue(t.dueAt, new Date()) ? 'tabular-nums text-red-600 dark:text-red-400' : 'tabular-nums'}>{t.dueAt ? formatDate(t.dueAt) : '—'}</span>
          </Field>
          <Field label="Hours">
            <span className="tabular-nums">{hoursLabel(t.loggedHours, t.estimateHours)}</span>
            <span className="block text-xs text-fg-muted">logged / estimate</span>
          </Field>
          {t.sprintId && <Field label="Sprint">{sprint?.name ?? (sprints.isLoading ? 'Loading…' : '—')}</Field>}
          <Field label="Created">
            <span className="tabular-nums">{formatDate(t.createdAt)}</span>
          </Field>
          <Field label="Updated">
            <span className="tabular-nums">{formatDate(t.updatedAt)}</span>
          </Field>
        </dl>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {t.status !== 'done' &&
            (myDay.data?.running?.taskId === t.id ? (
              <Button variant="secondary" onClick={() => stop.mutate()} disabled={stop.isPending}>
                <Square className="size-3.5 fill-current" /> {stop.isPending ? 'Stopping…' : 'Stop timer'}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => start.mutate({ taskId: t.id })} disabled={start.isPending}>
                <Play className="size-4" /> {start.isPending ? 'Starting…' : 'Start timer'}
              </Button>
            ))}
          <Button variant="ghost" onClick={() => setAddingTime(true)}>
            <Clock className="size-4" /> Add time
          </Button>
        </div>
        {(start.error || stop.error) && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{((start.error ?? stop.error) as Error).message}</p>}
        {addingTime && <AddTimeSheet projectId={t.projectId} taskId={t.id} onClose={() => setAddingTime(false)} />}
        <h3 className="mt-5 text-xs font-medium uppercase tracking-wide text-fg-muted">Description</h3>
        <p className="mt-1.5 whitespace-pre-line break-words text-sm text-fg-secondary">{t.description.trim() || '—'}</p>
        {editing && project && (
          <TaskSheet project={project} phases={phases.data ?? []} sprints={sprints.data ?? []} users={users.data ?? []} task={t} onClose={() => setEditing(false)} />
        )}
      </>
    )
    const count = comments.data?.length ?? 0
    body = (
      <>
        <div className="-mt-1 mb-3 flex gap-1 border-b border-line" role="tablist" aria-label="Task">
          {(
            [
              ['details', 'Details'],
              ['activity', 'Activity'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={clsx(
                'relative flex shrink-0 items-center gap-2 px-3 py-2 text-sm font-medium transition-colors',
                "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand-500 after:transition-transform after:duration-200 after:content-['']",
                tab === value ? 'text-fg after:scale-x-100' : 'text-fg-muted after:scale-x-0 hover:text-fg',
              )}
            >
              {label}
              {value === 'activity' && count > 0 && <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[11px] leading-none tabular-nums text-fg-tertiary">{count}</span>}
            </button>
          ))}
        </div>
        {tab === 'details' ? details : <TaskActivity task={t} project={project} users={users.data ?? []} />}
      </>
    )
  }

  return (
    <InspectorFrame label="Task" eyebrow={eyebrow} title={title} onClose={onClose}>
      {body}
    </InspectorFrame>
  )
}
