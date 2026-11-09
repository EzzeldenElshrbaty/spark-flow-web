import clsx from 'clsx'
import { Archive, Clock, Pencil, Play } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { noteDownload } from '@/api/audit'
import { useComments } from '@/api/comments'
import { openFile, usePhases, useProjectSummary } from '@/api/projects'
import { useArchiveTask, useRestoreTask, useSprints, useTicket, useUpdateTask } from '@/api/tickets'
import { useMyDay, useStartTimer } from '@/api/time'
import { TimerControls } from '@/layout/TimerBar'
import { timerForTask } from '@/lib/hours'
import type { Attachment, TicketStatus } from '@/api/types'
import { useUsers } from '@/api/users'
import { AttachmentView } from '@/components/AttachmentView'
import { ConfirmDeleteSheet } from '@/components/ConfirmDeleteSheet'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/ui/Button'
import { FileViewer } from '@/components/ui/FileViewer'
import { selectClass } from '@/components/ui/Field'
import { QueryError } from '@/components/ui/QueryError'
import { InspectorFrame, InspectorSkeleton, TitleSkeleton, type InspectorBodyProps } from '@/layout/InspectorFrame'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { ApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useCanLog } from '@/lib/useCanLog'
import { usePermission } from '@/lib/usePermission'
import { TaskSheet } from '@/pages/projects/TaskSheet'
import { AddTimeSheet } from '@/pages/time/AddTimeSheet'
import { TaskActivity } from '@/pages/projects/TaskActivity'
import { HistoryList } from '@/pages/projects/HistoryList'
import { useTaskHistory } from '@/api/activity'
import { BugPill, OverEstimatePill, OverduePill, PriorityPill, StatusPill, hoursLabel } from '@/pages/projects/ticketPills'
import { NotFound } from '@/pages/NotFound'
import { DescriptionView } from '@/pages/projects/description/DescriptionView'
import { isPastDue } from '@/lib/dates'
import { columnLabel, columnsOf } from '@/lib/boardColumns'
import { DEFAULT_COLUMNS } from '@/lib/statuses'

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
      <Avatar name={name} size={24} decorative />
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
  // By key (a task key starts with its project's), so an archived project's tasks still open; the list leaves those out.
  const projectQuery = useProjectSummary(workspace?.id, ticketKey.split('-')[0])
  const sprints = useSprints(ticket.data?.projectId)
  const phases = usePhases(ticket.data?.projectId)
  const update = useUpdateTask()
  const check = usePermission()
  const canLog = useCanLog()
  const [editing, setEditing] = useState(false)
  const [addingTime, setAddingTime] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const archive = useArchiveTask()
  const restore = useRestoreTask()
  const [tab, setTab] = useState<'details' | 'activity' | 'history'>('details')
  // A file opened from the description, in the viewer (Download inside, noted in the audit log).
  const [viewing, setViewing] = useState<{ id: string; name: string; url: string; sizeKb: number } | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const openDescriptionFile = async (file: Attachment) => {
    setOpenError(null)
    try {
      const url = await openFile(file.id)
      setViewing({ id: file.id, name: file.name, url, sizeKb: Math.round(file.size / 1024) })
    } catch {
      setOpenError(`${file.title} couldn't be opened. Try again.`)
    }
  }
  const closeViewer = () => {
    if (viewing) URL.revokeObjectURL(viewing.url)
    setViewing(null)
  }
  const history = useTaskHistory(ticketKey, tab === 'history')
  const comments = useComments(ticketKey)
  const myDay = useMyDay()
  const start = useStartTimer()
  const project = projectQuery.data && projectQuery.data.id === ticket.data?.projectId ? projectQuery.data : undefined
  // A ticket of another workspace's project is not found in this one.
  const foreign = Boolean(ticket.data && projectQuery.isSuccess && !project)

  const eyebrow = (
    <>
      Task · <bdi dir="ltr">{ticketKey}</bdi>
    </>
  )
  const title = foreign ? 'Ticket' : ticket.data && projectQuery.data !== undefined ? ticket.data.title : ticket.isPending || projectQuery.isLoading ? <TitleSkeleton /> : 'Ticket'

  let body
  if (foreign || (ticket.error instanceof ApiError && ticket.error.status === 404)) body = <NotFound what="ticket" backTo={closeTo} backLabel="Close the ticket" />
  else if (ticket.isError) body = <QueryError what="Ticket" onRetry={() => void ticket.refetch()} />
  else if (projectQuery.isError) body = <QueryError what="Project" onRetry={() => void projectQuery.refetch()} />
  else if (ticket.isPending || projectQuery.isLoading || users.isLoading) body = <InspectorSkeleton />
  else {
    const t = ticket.data
    const nameOf = (id: string | null) => (id ? (users.data?.find((u) => u.id === id)?.name ?? 'Unknown person') : null)
    const sprint = t.sprintId ? sprints.data?.find((s) => s.id === t.sprintId) : undefined
    const phase = t.phaseId ? phases.data?.find((p) => p.id === t.phaseId) : undefined
    const canManage = project ? check('task.manage', { project }) : false
    const canStatus = project ? check('task.updateOwnStatus', { project, taskAssigneeId: t.assigneeId }) : false
    const archived = Boolean(t.archivedAt)
    const details = (
      <>
        {archived && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm text-fg-secondary">
            <Archive className="size-4 shrink-0" />
            <span className="me-auto">This task is archived.</span>
            {canManage && (
              <Button variant="secondary" onClick={() => restore.mutate(t.key)} disabled={restore.isPending}>
                {restore.isPending ? 'Restoring…' : 'Restore task'}
              </Button>
            )}
            {restore.error && <span className="w-full text-xs text-red-600 dark:text-red-400">{restore.error.message}</span>}
          </div>
        )}
        {(t.type === 'bug' || t.overdue || t.overEstimate || (canManage && !archived)) && (
          <div className="mb-3 flex items-center gap-2">
            {t.type === 'bug' && <BugPill />}
            {t.overdue && <OverduePill />}
            {t.overEstimate && <OverEstimatePill />}
            {canManage && !archived && (
              <span className="ms-auto flex items-center gap-2">
                <Button variant="ghost" onClick={() => setArchiving(true)}>
                  <Archive className="size-4" /> Archive task
                </Button>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  <Pencil className="size-4" /> Edit task
                </Button>
              </span>
            )}
          </div>
        )}
        <dl className="divide-y divide-line-subtle text-sm">
          <Field label="Status">
            {canStatus && !t.archivedAt ? (
              <select
                className={selectClass}
                aria-label="Status"
                value={t.status}
                disabled={update.isPending}
                onChange={(e) => update.mutate({ key: t.key, patch: { status: e.target.value as TicketStatus } })}
              >
                {(project ? columnsOf(project) : DEFAULT_COLUMNS).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            ) : (
              <StatusPill status={t.status} category={t.category} label={project ? columnLabel(project, t.status) : undefined} />
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
            <span className={t.dueAt && t.category !== 'done' && isPastDue(t.dueAt, new Date()) ? 'tabular-nums text-red-600 dark:text-red-400' : 'tabular-nums'}>{t.dueAt ? formatDate(t.dueAt) : '—'}</span>
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
        <ConfirmDeleteSheet
          open={archiving}
          title="Archive this task?"
          description="It leaves the board, the lists and the project's counts. Its logged time and cost stay. You can restore it."
          actionLabel="Archive task"
          pendingLabel="Archiving…"
          tone="primary"
          askWhy
          onConfirm={(reason) => archive.mutateAsync({ key: t.key, reason })}
          onClose={() => setArchiving(false)}
        />
        {!archived && canLog(project) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {t.category !== 'done' &&
            (timerForTask(myDay.data?.timer, t.id) ? (
              <TimerControls timer={timerForTask(myDay.data?.timer, t.id)!} layout="card" />
            ) : (
              <Button variant="secondary" onClick={() => start.mutate({ taskId: t.id })} disabled={start.isPending}>
                <Play className="size-4" /> {start.isPending ? 'Starting…' : 'Start timer'}
              </Button>
            ))}
          <Button variant="ghost" onClick={() => setAddingTime(true)}>
            <Clock className="size-4" /> Add time
          </Button>
        </div>
        )}
        {start.error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{(start.error as Error).message}</p>}
        {addingTime && <AddTimeSheet projectId={t.projectId} taskId={t.id} onClose={() => setAddingTime(false)} />}
        <h3 className="mt-5 text-xs font-medium uppercase tracking-wide text-fg-muted">Description</h3>
        <div className="mt-1.5">
          <DescriptionView body={t.descriptionBody} files={t.attachments} onOpen={(file) => void openDescriptionFile(file)} />
        </div>
        {openError && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{openError}</p>}
        {viewing && <FileViewer files={[viewing]} onClose={closeViewer} onDownload={() => noteDownload(viewing.id)} />}
        {t.attachments.length > 0 && (
          <>
            <h3 className="mt-5 text-xs font-medium uppercase tracking-wide text-fg-muted">Attachments · {t.attachments.length}</h3>
            <AttachmentView attachments={t.attachments} />
          </>
        )}
        {/* Archived meanwhile (another tab): the sheet goes, since none of its edits could be saved. */}
        {editing && project && !archived && (
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
              ['activity', 'Comments'],
              ['history', 'History'],
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
        {tab === 'details' ? (
          details
        ) : tab === 'activity' ? (
          <TaskActivity task={t} project={project} users={users.data ?? []} />
        ) : history.isError ? (
          <QueryError what="History" onRetry={() => void history.refetch()} />
        ) : !history.data ? (
          <div className="h-24 animate-pulse rounded-lg bg-surface-muted" aria-hidden />
        ) : (
          <HistoryList entries={history.data} users={users.data ?? []} project={project} phases={phases.data ?? []} withKey={false} />
        )}
      </>
    )
  }

  return (
    <InspectorFrame label="Task" eyebrow={eyebrow} title={title} onClose={onClose}>
      {body}
    </InspectorFrame>
  )
}
