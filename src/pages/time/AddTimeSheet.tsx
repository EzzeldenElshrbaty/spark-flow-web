import { useState } from 'react'
import { useProjectSummaries } from '@/api/projects'
import { useArchivedTasks, useTickets } from '@/api/tickets'
import { useAddTime, useUpdateTime } from '@/api/time'
import type { TimeEntry } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Field, inputClass, selectClass } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { localDay } from '@/lib/dates'
import { defaultTimes, manualEntryErrors, toManualEntry, toPatch, valuesOf, type ManualEntryErrors, type ManualEntryValues } from './manualEntry'

/**
 * Add time after the fact: a task (or the project as a whole), the day, start and end, and a note. With an `entry`,
 * the same form fixes that entry. The form checks what it can; the server also refuses time that overlaps.
 */
export function AddTimeSheet({ projectId: forProject, taskId, entry, onClose }: { projectId?: string; taskId?: string; entry?: TimeEntry; onClose: () => void }) {
  // Editing keeps the entry's project; its task, day, times and note can change.
  const projectId = entry?.projectId ?? forProject
  const { workspace } = useCurrentWorkspace()
  const projects = useProjectSummaries(workspace?.id).data ?? []
  const add = useAddTime()
  const update = useUpdateTime()
  const saving = add.isPending || update.isPending
  const failure = (add.error ?? update.error) as Error | null
  const [values, setValues] = useState<ManualEntryValues>(() => (entry ? valuesOf(entry) : { ...defaultTimes(new Date()), note: '', taskId: taskId ?? null, projectId: projectId ?? '' }))
  const [errors, setErrors] = useState<ManualEntryErrors>({})
  const listed = useTickets(values.projectId || undefined).data ?? []
  // An entry's own task stays pickable even once archived (the list leaves archived tasks out).
  const own = useArchivedTasks(values.projectId || undefined, Boolean(entry?.taskId)).data?.find((t) => t.id === entry?.taskId)
  const tasks = own ? [...listed, own] : listed
  const set = <K extends keyof ManualEntryValues>(k: K, v: ManualEntryValues[K]) => setValues((s) => ({ ...s, [k]: v }))
  const fixedTask = taskId ? tasks.find((t) => t.id === taskId) : undefined
  const project = projects.find((p) => p.id === values.projectId)

  const save = () => {
    const found = manualEntryErrors(values, new Date())
    setErrors(found)
    if (Object.keys(found).length) return
    if (entry) update.mutate({ id: entry.id, patch: toPatch(values, valuesOf(entry)) }, { onSuccess: onClose })
    else add.mutate(toManualEntry(values), { onSuccess: onClose })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={entry ? 'Edit entry' : 'Add time'}
      description={fixedTask ? `${fixedTask.key} · ${fixedTask.title}` : (project?.name ?? 'Time you worked without the timer.')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {entry ? (saving ? 'Saving…' : 'Save') : saving ? 'Adding…' : 'Add time'}
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
        {!projectId && (
          <Field label="Project" required error={errors.task}>
            <select
              className={selectClass}
              value={values.projectId}
              aria-invalid={Boolean(errors.task)}
              onChange={(e) => setValues((s) => ({ ...s, projectId: e.target.value, taskId: null }))}
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
                .filter((t) => t.status !== 'done' || t.id === values.taskId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.key} · {t.title}
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
        <Field label="Note" hint="Optional" error={errors.note}>
          <input className={inputClass} value={values.note} aria-invalid={Boolean(errors.note)} onChange={(e) => set('note', e.target.value)} />
        </Field>
        {failure && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {failure.message}
          </p>
        )}
      </form>
    </Sheet>
  )
}
