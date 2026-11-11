import { useState } from 'react'
import { useArchivedTasks } from '@/api/tickets'
import { useAddTime, useUpdateTime } from '@/api/time'
import type { TimeEntry } from '@/api/types'
import { useUsers } from '@/api/users'
import { Button } from '@/components/ui/Button'
import { Field, inputClass, selectClass } from '@/components/ui/Field'
import { Sheet, SheetCancelButton } from '@/components/ui/Sheet'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { localDay } from '@/lib/dates'
import { isActive } from '@/lib/people'
import { projectPeople } from '@/lib/projectPeople'
import { usePermission } from '@/lib/usePermission'
import { useRole } from '@/lib/useRole'
import { useFormCheck } from '@/lib/useFormCheck'
import { defaultTimes, manualEntryErrors, toManualEntry, toPatch, valuesOf, type ManualEntryValues } from './manualEntry'
import { useLogTargets } from './useLogTargets'
import { announce } from '@/components/sf/Announcer'

/**
 * Add time after the fact, for an Admin or the project's manager only (11 Nov 2026): a task (or the project as a
 * whole), whose time it is (Me or someone on the project, picked every time), the day, start and end, and a note.
 * With an `entry`, the same form fixes that entry, which stays whose it is. The form checks what it can; the server
 * also refuses time that overlaps.
 */
export function AddTimeSheet({ projectId: forProject, taskId, entry, onClose }: { projectId?: string; taskId?: string; entry?: TimeEntry; onClose: () => void }) {
  // Editing keeps the entry's project; its task, day, times and note can change.
  const projectId = entry?.projectId ?? forProject
  const add = useAddTime()
  const update = useUpdateTime()
  const saving = add.isPending || update.isPending
  const failure = (add.error ?? update.error) as Error | null
  const [initial] = useState<ManualEntryValues>(() => (entry ? valuesOf(entry) : { ...defaultTimes(new Date()), note: '', taskId: taskId ?? null, projectId: projectId ?? '' }))
  const [values, setValues] = useState(initial)
  // Closing with changes asks first (UX Phase 1, 1.2).
  const dirty = JSON.stringify(values) !== JSON.stringify(initial)
  // Errors show from the first Save and follow each change after it (UX Phase 4, 4.4).
  const { errors, attempt, formRef } = useFormCheck(manualEntryErrors(values, new Date(), !entry))
  // Projects I'm on (or every one, for an Admin); a new entry only where I may add time (an Admin, or its manager).
  const check = usePermission()
  const { projects: loggable, tasks: listed } = useLogTargets(values.projectId, entry?.projectId)
  const projects = entry ? loggable : loggable.filter((project) => check('time.logFor', { project }))
  // An entry's own task stays pickable even once archived (the list leaves archived tasks out).
  const own = useArchivedTasks(values.projectId || undefined, Boolean(entry?.taskId)).data?.find((t) => t.id === entry?.taskId)
  const tasks = own ? [...listed, own] : listed
  const set = <K extends keyof ManualEntryValues>(k: K, v: ManualEntryValues[K]) => setValues((s) => ({ ...s, [k]: v }))
  const fixedTask = taskId ? tasks.find((t) => t.id === taskId) : undefined
  const project = projects.find((p) => p.id === values.projectId)
  // Whose time: Me, then the project's active people, picked for every new entry.
  const { persona } = useRole()
  const { workspace } = useCurrentWorkspace()
  const users = useUsers(workspace?.id).data
  const forOthers = !entry && project !== undefined && check('time.logFor', { project })
  const people = forOthers
    ? projectPeople(project, users ?? [])
        .filter((u) => isActive(u) && u.id !== persona.id)
        .sort((a, b) => a.name.localeCompare(b.name))
    : []

  // Read out once the sheet has closed (UX Phase 5A, 5.12).
  const done = (sentence: string) => () => {
    onClose()
    announce(sentence)
  }
  const save = () => {
    // Enter again while it saves sends nothing (final review).
    if (saving || !attempt()) return
    if (entry) update.mutate({ id: entry.id, patch: toPatch(values, valuesOf(entry)) }, { onSuccess: done('Time entry saved.') })
    else add.mutate(toManualEntry({ ...values, userId: forOthers ? values.userId : undefined }), { onSuccess: done('Time added.') })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      dirty={dirty}
      discardQuestion={entry ? 'Discard your changes?' : 'Discard this time entry?'}
      title={entry ? 'Edit entry' : 'Add time'}
      description={fixedTask ? `${fixedTask.key} · ${fixedTask.title}` : (project?.name ?? 'Time you worked without the timer.')}
      footer={
        <>
          <SheetCancelButton />
          <Button onClick={save} disabled={saving}>
            {entry ? (saving ? 'Saving…' : 'Save') : saving ? 'Adding…' : 'Add time'}
          </Button>
        </>
      }
    >
      <form
        ref={formRef}
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        {!projectId && (
          <Field label="Project" required error={errors.task}>
            <select
              className={selectClass}
              value={values.projectId}
              aria-invalid={Boolean(errors.task)}
              onChange={(e) => setValues((s) => ({ ...s, projectId: e.target.value, taskId: null, userId: '' }))}
            >
              <option value="">Choose…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {!taskId && (
          <Field label="Task">
            <select className={selectClass} value={values.taskId ?? ''} disabled={!values.projectId} onChange={(e) => set('taskId', e.target.value || null)}>
              <option value="">No task</option>
              {tasks
                .filter((t) => t.category !== 'done' || t.id === values.taskId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.key} · {t.title}
                  </option>
                ))}
            </select>
          </Field>
        )}
        {forOthers && (
          <Field label="Person" required error={errors.person}>
            <select className={selectClass} value={values.userId ?? ''} aria-invalid={Boolean(errors.person)} onChange={(e) => set('userId', e.target.value)}>
              <option value="">Choose…</option>
              <option value={persona.id}>Me</option>
              {people.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Day" required>
          <input type="date" className={inputClass} value={values.day} max={localDay(new Date())} onChange={(e) => set('day', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start" required>
            <input type="time" step={300} className={inputClass} value={values.start} onChange={(e) => set('start', e.target.value)} />
          </Field>
          <Field label="End" required error={errors.end}>
            <input type="time" step={300} className={inputClass} value={values.end} aria-invalid={Boolean(errors.end)} onChange={(e) => set('end', e.target.value)} />
          </Field>
        </div>
        {/* A refusal from the server (an overlap, mostly) sits right under the times it's about. */}
        {failure && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {failure.message}
          </p>
        )}
        <Field label="Note" hint="Optional" error={errors.note}>
          <input className={inputClass} value={values.note} aria-invalid={Boolean(errors.note)} onChange={(e) => set('note', e.target.value)} />
        </Field>
        {/* Enter in a field saves, as the footer's button does. */}
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}
