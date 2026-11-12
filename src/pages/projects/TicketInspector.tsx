import clsx from 'clsx'
import { Archive, ArrowUpRight, Clock, Maximize2, Minimize2, Pencil, Play } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { noteDownload } from '@/api/audit'
import { useChannels } from '@/api/chat'
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
import { withInspector } from '@/lib/inspector'
import { paths } from '@/lib/paths'
import { useCanAddTime } from '@/lib/useCanAddTime'
import { useCanLog } from '@/lib/useCanLog'
import { useRole } from '@/lib/useRole'
import { useUiStore } from '@/lib/uiStore'
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

/** One field: its label over its value, in half a row (`span`: the whole row). */
function Field({ label, span = false, children }: { label: string; span?: boolean; children: ReactNode }) {
  return (
    <div className={clsx('min-w-0', span && 'col-span-2')}>
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="mt-1 min-w-0 break-words text-fg">{children}</dd>
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
  const { pathname } = useLocation()
  const { persona } = useRole()
  const wide = useUiStore((state) => Boolean(state.wideTaskPanel[persona.id]))
  const setWide = useUiStore((state) => state.setWideTaskPanel)
  const ticket = useTicket(ticketKey)
  const users = useUsers(workspace?.id)
  // By key (a task key starts with its project's), so an archived project's tasks still open; the list leaves those out.
  const projectQuery = useProjectSummary(workspace?.id, ticketKey.split('-')[0])
  const sprints = useSprints(ticket.data?.projectId)
  // The channels I can see, for "Made from": a private channel I'm not in isn't named.
  const channels = useChannels(workspace?.id)
  const phases = usePhases(ticket.data?.projectId)
  const update = useUpdateTask()
  const check = usePermission()
  const canLog = useCanLog()
  const canAddTime = useCanAddTime()
  const [editing, setEditing] = useState(false)
  const [addingTime, setAddingTime] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const archive = useArchiveTask()
  const restore = useRestoreTask()
  // A file opened from the description, in the viewer (Download inside, noted in the audit log).
  const [viewing, setViewing] = useState<{ id: string; name: string; url: string; sizeKb: number } | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const openDescriptionFile = async (file: Attachment) => {
    setOpenError(null)
    try {
      const url = await openFile(file.id)
      setViewing({ id: file.id, name: file.name, url, sizeKb: Math.round(file.size / 1024) })
    } catch {
      setOpenError(`${file.title} couldn’t be opened. Try again.`)
    }
  }
  const closeViewer = () => {
    if (viewing) URL.revokeObjectURL(viewing.url)
    setViewing(null)
  }
  // Details, comments and history in one scroll (11 Nov 2026), so history loads with the panel.
  const history = useTaskHistory(ticketKey, true)
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
    const source = t.linkedChannelId && t.linkedMessageId ? channels.data?.find((c) => c.id === t.linkedChannelId) : undefined
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
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {t.type === 'bug' && <BugPill />}
            {t.overdue && <OverduePill />}
            {t.overEstimate && <OverEstimatePill />}
            {canManage && !archived && (
              // Never squeezed: beside the pills when they fit, on their own line when they don't.
              <span className="ms-auto flex shrink-0 items-center gap-2 whitespace-nowrap">
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
        {/* What the task is comes first, in its own box (11 Nov 2026): the description, then the task's files. */}
        <section aria-labelledby="task-description" className="mb-4 rounded-xl border border-line bg-surface-muted p-4">
          <h3 id="task-description" className="text-xs font-medium uppercase tracking-wide text-fg-tertiary">
            Description
          </h3>
          <div className="mt-1.5">
            <DescriptionView body={t.descriptionBody} files={t.attachments} onOpen={(file) => void openDescriptionFile(file)} />
          </div>
          {openError && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{openError}</p>}
          {t.attachments.length > 0 && (
            <>
              <h3 className="mt-4 text-xs font-medium uppercase tracking-wide text-fg-tertiary">Attachments · {t.attachments.length}</h3>
              <AttachmentView attachments={t.attachments} />
            </>
          )}
        </section>
        {viewing && <FileViewer files={[viewing]} onClose={closeViewer} onDownload={() => noteDownload(viewing.id)} />}
        {/* Two to a row (11 Nov 2026), in pairs that belong together; Hours and Made from take the whole row. */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
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
          <Field label="Priority">
            <PriorityPill priority={t.priority} />
          </Field>
          <Field label="Assignee">
            <Person name={nameOf(t.assigneeId)} />
          </Field>
          <Field label="Reporter">
            <Person name={nameOf(t.reporterId)} />
          </Field>
          <Field label="Project">
            {project && workspace ? (
              <Link to={paths.project(workspace.slug, project.key)} className="font-medium text-accent hover:underline">
                {project.name}
              </Link>
            ) : (
              '—'
            )}
          </Field>
          <Field label="Phase">{phase?.name ?? '—'}</Field>
          <Field label="Type">{t.type === 'bug' ? 'Bug' : 'Task'}</Field>
          <Field label="Due">
            <span className={t.dueAt && t.category !== 'done' && isPastDue(t.dueAt, new Date()) ? 'tabular-nums text-red-600 dark:text-red-400' : 'tabular-nums'}>{t.dueAt ? formatDate(t.dueAt) : '—'}</span>
          </Field>
          <Field label="Hours" span>
            <span className="tabular-nums">{hoursLabel(t.loggedHours, t.estimateHours)}</span>
            <span className="ms-2 text-xs text-fg-muted">logged / estimate</span>
          </Field>
          {/* Agile: Sprint and Points as a pair, either one — when it has none. */}
          {(t.sprintId || t.storyPoints !== null) && (
            <>
              <Field label="Sprint">{t.sprintId ? (sprint?.name ?? (sprints.isLoading ? <span aria-hidden className="inline-block h-3 w-20 animate-pulse rounded bg-surface-strong align-middle" /> : '—')) : '—'}</Field>
              <Field label="Points">{t.storyPoints !== null ? <span className="tabular-nums">{t.storyPoints}</span> : '—'}</Field>
            </>
          )}
          <Field label="Created">
            <span className="tabular-nums">{formatDate(t.createdAt)}</span>
          </Field>
          <Field label="Updated">
            <span className="tabular-nums">{formatDate(t.updatedAt)}</span>
          </Field>
          {/* The chat message the task was made from (Create task, /task), where I can see its channel. */}
          {source?.name && workspace && t.linkedMessageId && (
            <Field label="Made from" span>
              <Link to={paths.message(workspace.slug, source.id, t.linkedMessageId)} className="font-medium text-accent hover:underline">
                A message in #{source.name}
              </Link>
            </Field>
          )}
        </dl>
        <ConfirmDeleteSheet
          open={archiving}
          title="Archive this task?"
          description="It leaves the board, the lists and the project’s counts. Its logged time and cost stay. You can restore it."
          actionLabel="Archive task"
          pendingLabel="Archiving…"
          tone="primary"
          askWhy
          onConfirm={(reason) => archive.mutateAsync({ key: t.key, reason })}
          onClose={() => setArchiving(false)}
        />
        {/* The timer for everyone on the project; Add time for an Admin or its manager only (11 Nov 2026). */}
        {!archived && (canLog(project) || canAddTime(project)) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {canLog(project) && t.category !== 'done' &&
            (timerForTask(myDay.data?.timer, t.id) ? (
              <TimerControls timer={timerForTask(myDay.data?.timer, t.id)!} layout="card" />
            ) : (
              <Button variant="secondary" onClick={() => start.mutate({ taskId: t.id })} disabled={start.isPending}>
                <Play className="size-4" /> {start.isPending ? 'Starting…' : 'Start timer'}
              </Button>
            ))}
          {canAddTime(project) && (
            <Button variant="ghost" onClick={() => setAddingTime(true)}>
              <Clock className="size-4" /> Add time
            </Button>
          )}
        </div>
        )}
        {start.error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{(start.error as Error).message}</p>}
        {addingTime && <AddTimeSheet projectId={t.projectId} taskId={t.id} onClose={() => setAddingTime(false)} />}
        {/* Archived meanwhile (another tab): the sheet goes, since none of its edits could be saved. */}
        {editing && project && !archived && (
          <TaskSheet project={project} phases={phases.data ?? []} sprints={sprints.data ?? []} users={users.data ?? []} task={t} onClose={() => setEditing(false)} />
        )}
      </>
    )
    const count = comments.data?.length ?? 0
    const section = 'mt-6 border-t border-line-subtle pt-4'
    const heading = 'text-xs font-medium uppercase tracking-wide text-fg-muted'
    body = (
      <>
        {details}
        <section className={section} aria-labelledby="task-comments">
          <h3 id="task-comments" className={`mb-3 ${heading}`}>
            Comments{count > 0 && ` · ${count}`}
          </h3>
          <TaskActivity task={t} project={project} users={users.data ?? []} />
        </section>
        <section className={section} aria-labelledby="task-history">
          <h3 id="task-history" className={`mb-3 ${heading}`}>
            History
          </h3>
          {history.isError ? (
            <QueryError what="History" onRetry={() => void history.refetch()} />
          ) : !history.data ? (
            <div className="h-24 animate-pulse rounded-lg bg-surface-muted" aria-hidden />
          ) : (
            <HistoryList entries={history.data} users={users.data ?? []} project={project} phases={phases.data ?? []} withKey={false} />
          )}
        </section>
      </>
    )
  }

  // The header's own controls, in the kit look of its Close.
  const headerButton = 'rounded-md p-1 text-fg-muted hover:bg-surface-muted hover:text-fg max-md:touch-target'
  // The task on its project's board, with this panel open: offered everywhere but that board. An agile board opens on
  // the task's sprint, or on All sprints for this visit (`sprint=`, not remembered) for a task in none, so the task is
  // there (the board's default is the running sprint).
  const board = project && workspace ? paths.project(workspace.slug, project.key, 'tasks') : null
  const onBoard = new URLSearchParams(project?.methodology === 'agile' && ticket.data ? { sprint: ticket.data.sprintId ?? '' } : {})
  const openInProject = board && pathname !== board && (
    <Link
      to={`${board}?${withInspector(onBoard, { kind: 'ticket', key: ticketKey }).toString()}`}
      className={headerButton}
      aria-label="Open in project"
      title="Open in project"
    >
      <ArrowUpRight className="size-5 rtl:-scale-x-100" />
    </Link>
  )

  const sizeLabel = wide ? 'Shrink panel' : 'Expand panel'
  const actions = (
    <>
      <button type="button" className={headerButton} aria-label={sizeLabel} title={sizeLabel} onClick={() => setWide(persona.id, !wide)}>
        {wide ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
      </button>
      {openInProject}
    </>
  )

  return (
    <InspectorFrame label="Task" eyebrow={eyebrow} title={title} onClose={onClose} actions={actions} wide={wide}>
      {body}
    </InspectorFrame>
  )
}
