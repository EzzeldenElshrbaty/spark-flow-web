import clsx from 'clsx'
import { useState } from 'react'
import { useCreateTask, useUpdateTask } from '@/api/tickets'
import type { NewTicket, Phase, Priority, Project, Sprint, TaskType, TaskView, TicketStatus, User } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Field, inputClass, selectClass } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { projectPeople } from '@/lib/projectPeople'
import { usePermission } from '@/lib/usePermission'
import { byOrder } from './phases'
import { assigneeOptions, savePatch } from './taskForm'
import { columnsOf, startColumn } from '@/lib/boardColumns'

const priorities: [Priority, string][] = [
  ['urgent', 'Urgent'],
  ['high', 'High'],
  ['medium', 'Medium'],
  ['low', 'Low'],
]

type Values = {
  title: string
  description: string
  type: TaskType
  phaseId: string
  status: TicketStatus
  priority: Priority
  assigneeId: string
  due: string
  estimate: string
  sprintId: string
}

/** What a new task starts from when it is made from somewhere else (a chat message). */
export type TaskDraft = Pick<NewTicket, 'title' | 'description'> & Partial<Pick<NewTicket, 'linkedChannelId' | 'linkedMessageId' | 'assigneeId'>>

const valuesOf = (task: TaskView | undefined, phaseId: string | null, firstStatus: string, draft?: TaskDraft): Values => ({
  title: task?.title ?? draft?.title ?? '',
  description: task?.description ?? draft?.description ?? '',
  type: task?.type ?? 'task',
  phaseId: (task ? task.phaseId : phaseId) ?? '',
  status: task?.status ?? firstStatus,
  priority: task?.priority ?? 'medium',
  assigneeId: task?.assigneeId ?? draft?.assigneeId ?? '',
  due: task?.dueAt ? task.dueAt.slice(0, 10) : '',
  estimate: task?.estimateHours != null ? String(task.estimateHours) : '',
  sprintId: task?.sprintId ?? '',
})

/**
 * New task or Edit task, as a drawer. The project's manager (and admins) change everything; the assignee changes only
 * the status, and the other fields are shown read-only.
 */
export function TaskSheet({
  project,
  phases,
  sprints,
  users,
  task,
  draft,
  onClose,
}: {
  project: Project & { currentPhaseId?: string | null }
  phases: Phase[]
  sprints: Sprint[]
  users: User[]
  task?: TaskView
  /** Starts a new task from these values and links it back to where it came from. */
  draft?: TaskDraft
  onClose: () => void
}) {
  const check = usePermission()
  const canManage = check('task.manage', { project })
  const canStatus = canManage || check('task.updateOwnStatus', { project, taskAssigneeId: task?.assigneeId ?? null })
  const create = useCreateTask()
  const update = useUpdateTask()
  const [values, setValues] = useState(() => valuesOf(task, project.currentPhaseId ?? null, startColumn(project), draft))
  // The task as it was when the sheet opened: the prop follows live updates, so it can't tell what I changed.
  const [opened] = useState(task)
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({})
  const set = <K extends keyof Values>(k: K, v: Values[K]) => setValues((s) => ({ ...s, [k]: v }))
  const people = projectPeople(project, users)
  const saving = create.isPending || update.isPending
  const failure = (create.error ?? update.error) as Error | null
  const ro = !canManage

  const save = () => {
    const found: typeof errors = {}
    if (!values.title.trim()) found.title = 'Give the task a title.'
    const estimate = values.estimate.trim() === '' ? null : Number(values.estimate)
    if (estimate !== null && (!Number.isFinite(estimate) || estimate < 0)) found.estimate = 'The estimate is 0 hours or more.'
    setErrors(found)
    if (Object.keys(found).length) return
    if (task && !canManage) {
      const patch = savePatch(opened ?? task, { status: values.status }, false)
      if (Object.keys(patch).length === 0) onClose()
      else update.mutate({ key: task.key, patch }, { onSuccess: onClose })
      return
    }
    const fields = {
      title: values.title.trim(),
      description: values.description,
      type: values.type,
      phaseId: values.phaseId || null,
      status: values.status,
      priority: values.priority,
      assigneeId: values.assigneeId || null,
      dueAt: values.due ? new Date(`${values.due}T00:00:00.000Z`).toISOString() : null,
      estimateHours: estimate,
      sprintId: project.methodology === 'agile' ? values.sprintId || null : (task?.sprintId ?? null),
    }
    if (task) {
      // Only what changed: the rest may have moved on since the sheet was opened.
      const patch = savePatch(opened ?? task, fields, true)
      if (Object.keys(patch).length === 0) onClose()
      else update.mutate({ key: task.key, patch }, { onSuccess: onClose })
    }
    else
      create.mutate(
        { ...fields, projectId: project.id, storyPoints: null, linkedChannelId: draft?.linkedChannelId, linkedMessageId: draft?.linkedMessageId } satisfies NewTicket,
        { onSuccess: onClose },
      )
  }

  return (
    <Sheet
      open
      onClose={onClose}
      variant="drawer"
      title={task ? 'Edit task' : 'New task'}
      description={task ? `${task.key} · ${project.name}` : project.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || (!canManage && !canStatus)}>
            {saving ? 'Saving…' : 'Save task'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        {ro && <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-fg-secondary">{canStatus ? 'You can change the status. The project manager changes the rest.' : 'Only the project manager changes this task.'}</p>}
        <Field label="Title" required error={errors.title}>
          <input className={inputClass} value={values.title} disabled={ro} aria-invalid={Boolean(errors.title)} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Description">
          <textarea className={inputClass} rows={4} value={values.description} disabled={ro} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-fg-secondary">Type</span>
          <div className="inline-flex rounded-lg border border-line p-0.5" role="radiogroup" aria-label="Type">
            {(
              [
                ['task', 'Task'],
                ['bug', 'Bug'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={values.type === value}
                disabled={ro}
                onClick={() => set('type', value)}
                className={clsx('rounded-md px-3 py-1 text-sm disabled:cursor-default', values.type === value ? 'bg-surface-muted font-medium text-fg' : 'text-fg-muted hover:text-fg')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status">
            <select className={selectClass} value={values.status} disabled={!canStatus} onChange={(e) => set('status', e.target.value as TicketStatus)}>
              {columnsOf(project).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select className={selectClass} value={values.priority} disabled={ro} onChange={(e) => set('priority', e.target.value as Priority)}>
              {priorities.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Phase">
            <select className={selectClass} value={values.phaseId} disabled={ro} onChange={(e) => set('phaseId', e.target.value)}>
              <option value="">No phase</option>
              {byOrder(phases).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assignee">
            <select className={selectClass} value={values.assigneeId} disabled={ro} onChange={(e) => set('assigneeId', e.target.value)}>
              <option value="">Unassigned</option>
              {assigneeOptions(people, users, task?.assigneeId ?? null).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Due" hint="Optional">
            <input type="date" className={inputClass} value={values.due} disabled={ro} onChange={(e) => set('due', e.target.value)} />
          </Field>
          <Field label="Estimate (hours)" hint="Optional" error={errors.estimate}>
            <input type="number" min={0} step={0.5} inputMode="decimal" className={inputClass} value={values.estimate} disabled={ro} aria-invalid={Boolean(errors.estimate)} onChange={(e) => set('estimate', e.target.value)} />
          </Field>
          {project.methodology === 'agile' && (
            <Field label="Sprint">
              <select className={selectClass} value={values.sprintId} disabled={ro} onChange={(e) => set('sprintId', e.target.value)}>
                <option value="">No sprint</option>
                {sprints
                  .filter((s) => s.state !== 'closed' || s.id === values.sprintId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
        </div>
        {failure && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {failure.message}
          </p>
        )}
      </form>
    </Sheet>
  )
}
