import clsx from 'clsx'
import { lazy, Suspense, useRef, useState } from 'react'
import { useCreateTask, useUpdateTask } from '@/api/tickets'
import { uploadTaskFile } from '@/api/files'
import type { Attachment, NewTicket, Phase, Priority, Project, Sprint, TaskType, TaskView, TicketStatus, User } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Field, inputClass, selectClass } from '@/components/ui/Field'
import { Sheet, SheetCancelButton } from '@/components/ui/Sheet'
import { projectPeople } from '@/lib/projectPeople'
import { usePermission } from '@/lib/usePermission'
import { byOrder } from './phases'
import { assigneeOptions, savePatch } from './taskForm'
import { columnsOf, startColumn } from '@/lib/boardColumns'
import type { DescBody } from '@/lib/messageBody'
import { TaskAttachments } from './TaskAttachments'
import { useUploadQueue } from './useUploadQueue'
import type { DescriptionEditorHandle } from './description/DescriptionEditor'

// The editor (Lexical) loads with the sheet, not with the page.
const DescriptionEditor = lazy(() => import('./description/DescriptionEditor'))
/** An upload added in the description: its tag carries where the caret was (`editor:<place>`). */
const EDITOR_TAG = 'editor:'
/** How many files a task holds, as the server allows (spec §4.2). */
const MAX_TASK_FILES = 20

const priorities: [Priority, string][] = [
  ['urgent', 'Urgent'],
  ['high', 'High'],
  ['medium', 'Medium'],
  ['low', 'Low'],
]

type Values = {
  title: string
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
export type TaskDraft = Pick<NewTicket, 'title' | 'descriptionBody'> & Partial<Pick<NewTicket, 'linkedChannelId' | 'linkedMessageId' | 'assigneeId'>>

const valuesOf = (task: TaskView | undefined, phaseId: string | null, firstStatus: string, draft?: TaskDraft): Values => ({
  title: task?.title ?? draft?.title ?? '',
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
  // What the sheet opened with, to tell whether closing would throw anything away (UX Phase 1, 1.2).
  const [initial] = useState(() => valuesOf(task, project.currentPhaseId ?? null, startColumn(project), draft))
  const [values, setValues] = useState(initial)
  // The task as it was when the sheet opened: the prop follows live updates, so it can't tell what I changed.
  const [opened] = useState(task)
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({})
  const set = <K extends keyof Values>(k: K, v: Values[K]) => setValues((s) => ({ ...s, [k]: v }))
  // The description as the editor has it; sent only when it differs from the task's (deep, on an edit).
  const [initialBody] = useState<DescBody>(() => task?.descriptionBody ?? draft?.descriptionBody ?? [])
  const [descriptionBody, setDescriptionBody] = useState<DescBody>(initialBody)
  const editor = useRef<DescriptionEditorHandle>(null)
  // The task's files as they'll be saved: its files as they are now (the `task` prop follows live updates, so one
  // another manager adds meanwhile stays), less those I took off, plus my uploads as they finish. One added in the
  // description also goes where its caret was then. × takes one off, and out of the description (saved on Save).
  const [added, setAdded] = useState<Attachment[]>([])
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  const live = task?.attachments ?? []
  const attachments = [...live, ...added.filter((a) => !live.some((l) => l.id === a.id))].filter((a) => !removed.has(a.id))
  const queue = useUploadQueue(
    (file, { signal, onProgress }) => uploadTaskFile(project.id, file, { signal, onProgress }),
    (file, row) => {
      setAdded((all) => [...all, file])
      if (row.tag?.startsWith(EDITOR_TAG)) editor.current?.insertFile(file, row.tag.slice(EDITOR_TAG.length) || null)
    },
    // Closing the sheet drops what it was uploading: nothing would ever attach it. A file past the 20th fails as it's
    // added, as the server would refuse the task at Save.
    { cancelOnUnmount: true, limit: { room: MAX_TASK_FILES - attachments.length, sentence: `Attach up to ${MAX_TASK_FILES} files to a task.` } },
  )
  const removeAttachment = (id: string) => {
    setRemoved((all) => new Set(all).add(id))
    editor.current?.removeFile(id)
  }
  const people = projectPeople(project, users)
  const saving = create.isPending || update.isPending
  const failure = (create.error ?? update.error) as Error | null
  const ro = !canManage
  const dirty =
    JSON.stringify(values) !== JSON.stringify(initial) || JSON.stringify(descriptionBody) !== JSON.stringify(initialBody) || added.length > 0 || removed.size > 0 || queue.busy

  const save = () => {
    // ⌘/Ctrl+Enter in the description while a file still uploads, or a second time while saving: Save waits too.
    if (queue.busy || saving) return
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
    // The description shows only files the task will have (an undo may have brought back one taken off).
    const fileIds = new Set(attachments.map((a) => a.id))
    const filesTouched = !task || added.length > 0 || removed.size > 0
    const fields = {
      title: values.title.trim(),
      descriptionBody: descriptionBody.filter((b) => b.type !== 'file' || fileIds.has(b.id)),
      type: values.type,
      phaseId: values.phaseId || null,
      status: values.status,
      priority: values.priority,
      assigneeId: values.assigneeId || null,
      dueAt: values.due ? new Date(`${values.due}T00:00:00.000Z`).toISOString() : null,
      estimateHours: estimate,
      sprintId: project.methodology === 'agile' ? values.sprintId || null : (task?.sprintId ?? null),
      ...(filesTouched && { attachmentIds: [...fileIds] }),
    }
    if (task) {
      // Only what changed: the rest may have moved on since the sheet was opened. Its files are compared as shown
      // (a deleted one isn't), so an untouched list isn't sent.
      const was = opened ?? task
      const patch = savePatch({ ...was, attachmentIds: was.attachments.map((a) => a.id) }, fields, true)
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
      dirty={dirty}
      discardQuestion={task ? 'Discard your changes?' : 'Discard this new task?'}
      variant="drawer"
      title={task ? 'Edit task' : 'New task'}
      description={task ? `${task.key} · ${project.name}` : project.name}
      footer={
        <>
          <SheetCancelButton />
          <Button onClick={save} disabled={saving || queue.busy || (!canManage && !canStatus)}>
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
        {/* Not a <label>: a click in the editor mustn't reach the toolbar's file picker. */}
        <div>
          <span className="mb-1.5 block text-sm font-medium text-fg-secondary">Description</span>
          <Suspense fallback={<div className="h-32 animate-pulse rounded-lg bg-surface-muted" aria-hidden />}>
            <DescriptionEditor
              ref={editor}
              initial={descriptionBody}
              files={attachments}
              readOnly={ro}
              label="Description"
              onChange={setDescriptionBody}
              onFiles={(files, place) => queue.add(files, `${EDITOR_TAG}${place ?? ''}`)}
              onSubmit={save}
            />
          </Suspense>
        </div>
        <div>
          <TaskAttachments
            files={attachments}
            rows={queue.rows}
            readOnly={ro}
            onAdd={(files) => queue.add(files, 'attachments')}
            onRemove={removeAttachment}
            onCancel={queue.cancel}
            onRetry={queue.retry}
            onDismiss={queue.dismiss}
            canRetry={queue.canRetry}
          />
          {queue.busy && <p className="mt-1 text-xs text-fg-muted">Wait for the files to finish uploading.</p>}
        </div>
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
