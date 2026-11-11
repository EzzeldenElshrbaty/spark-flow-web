import { useState } from 'react'
import { useCreateSprint, useStartSprint, useUpdateSprint } from '@/api/sprints'
import type { ProjectSummary, Sprint, SprintPatch, TaskView } from '@/api/types'
import { announce } from '@/components/sf/Announcer'
import { Button } from '@/components/ui/Button'
import { Field, inputClass } from '@/components/ui/Field'
import { Sheet, SheetCancelButton } from '@/components/ui/Sheet'
import { toLocalInput } from '@/lib/format'
import { defaultSprintDates, nextSprintName, sprintErrors, sprintTotals } from '@/lib/sprints'
import { useFormCheck } from '@/lib/useFormCheck'
import { count } from './count'

/** The local day of an ISO moment, as a date field holds it ("2026-12-02"). */
const dayOf = (iso: string) => toLocalInput(new Date(iso)).slice(0, 10)

/**
 * A picked day as the sprint stores it: its start is the start of the local day and its end the end (23:59:59.999) of
 * the local day, as `defaultSprintDates` makes them. An empty or unreadable day is '' (`sprintErrors` refuses it).
 */
function momentOf(day: string, edge: 'start' | 'end'): string {
  const at = new Date(`${day}T${edge === 'start' ? '00:00:00' : '23:59:59.999'}`)
  return Number.isNaN(at.getTime()) ? '' : at.toISOString()
}

type Props = {
  project: ProjectSummary
  /** Every sprint of the project, the closed ones too: a new one is named and dated after them all. */
  sprints: Sprint[]
  /** The project's tasks, whatever the filters: Start counts the sprint's own. */
  tasks: TaskView[]
  onClose: () => void
} & ({ mode: 'create'; sprint?: undefined } | { mode: 'edit' | 'start'; sprint: Sprint })

/**
 * Create sprint (the next name, two weeks after the last one), Edit sprint (its name, dates and goal; the state stays)
 * and Start sprint (the same fields, confirmed, with what the sprint holds). Errors sit under their field from the
 * first Save; what the server refuses (one already running, an empty sprint) is the form's own sentence.
 */
export function SprintSheet({ mode, project, sprint, sprints, tasks, onClose }: Props) {
  const create = useCreateSprint()
  const update = useUpdateSprint()
  const start = useStartSprint()
  const [opened] = useState(() => {
    if (sprint) return { name: sprint.name, goal: sprint.goal, startDay: dayOf(sprint.startDate), endDay: dayOf(sprint.endDate) }
    const dates = defaultSprintDates(sprints, new Date())
    return { name: nextSprintName(sprints.map((s) => s.name)), goal: '', startDay: dayOf(dates.startDate), endDay: dayOf(dates.endDate) }
  })
  const [name, setName] = useState(opened.name)
  const [goal, setGoal] = useState(opened.goal)
  const [startDay, setStartDay] = useState(opened.startDay)
  const [endDay, setEndDay] = useState(opened.endDay)
  // Closing with changes asks first (UX Phase 1, 1.2), against the values as opened.
  const dirty = name !== opened.name || goal !== opened.goal || startDay !== opened.startDay || endDay !== opened.endDay
  const pending = create.isPending || update.isPending || start.isPending
  const failure = (create.error ?? update.error ?? start.error) as Error | null

  // Each error under its own field, from the first Save on (UX Phase 4, 4.4). A day that's missing is asked for under
  // its own field; the rules' end-before-start sentence waits for both.
  const form = { name, goal, startDate: momentOf(startDay, 'start'), endDate: momentOf(endDay, 'end') }
  const rules = sprintErrors(form)
  const { errors, attempt, formRef } = useFormCheck({
    name: rules.name,
    goal: rules.goal,
    startDate: startDay ? undefined : 'Pick a start date.',
    endDate: endDay ? (startDay ? rules.endDate : undefined) : 'Pick an end date.',
  })

  // Read out once the sheet has closed (UX Phase 5A, 5.12).
  const done = (sentence: string) => () => {
    onClose()
    announce(sentence)
  }
  const save = () => {
    // Enter again while it saves sends nothing (final review).
    if (pending || !attempt()) return
    const fields = { name: name.trim(), goal: goal.trim(), startDate: form.startDate, endDate: form.endDate }
    if (mode === 'create') return create.mutate({ projectId: project.id, ...fields }, { onSuccess: done(`${fields.name} created.`) })
    if (mode === 'start') return start.mutate({ id: sprint.id, input: fields }, { onSuccess: done(`${fields.name} started.`) })
    // Only what changed (a date by its day: a stored one may carry a time).
    const patch: SprintPatch = {}
    if (fields.name !== sprint.name) patch.name = fields.name
    if (fields.goal !== sprint.goal) patch.goal = fields.goal
    if (startDay !== dayOf(sprint.startDate)) patch.startDate = fields.startDate
    if (endDay !== dayOf(sprint.endDate)) patch.endDate = fields.endDate
    if (Object.keys(patch).length === 0) return onClose()
    update.mutate({ id: sprint.id, patch }, { onSuccess: done(`${fields.name} saved.`) })
  }

  const totals = mode === 'start' ? sprintTotals(tasks, sprint.id) : null
  const label = { create: 'Save', edit: 'Save', start: 'Start sprint' }[mode]
  const busy = { create: 'Saving…', edit: 'Saving…', start: 'Starting…' }[mode]

  return (
    <Sheet
      open
      onClose={onClose}
      dirty={dirty}
      discardQuestion={mode === 'create' ? 'Discard this new sprint?' : 'Discard your changes?'}
      title={{ create: 'Create sprint', edit: 'Edit sprint', start: 'Start sprint' }[mode]}
      description={project.name}
      footer={
        <>
          <SheetCancelButton disabled={pending} />
          <Button onClick={save} disabled={pending}>
            {pending ? busy : label}
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
        {totals && <p className="rounded-lg bg-surface-sunken px-3 py-2 text-sm tabular-nums text-fg-secondary">{count(totals.tasks, 'task')} · {count(totals.points, 'point')}</p>}
        <Field label="Name" required error={errors.name}>
          <input className={inputClass} value={name} aria-invalid={Boolean(errors.name)} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start" required error={errors.startDate}>
            <input type="date" className={inputClass} value={startDay} aria-invalid={Boolean(errors.startDate)} onChange={(e) => setStartDay(e.target.value)} />
          </Field>
          <Field label="End" required error={errors.endDate}>
            <input type="date" className={inputClass} value={endDay} aria-invalid={Boolean(errors.endDate)} onChange={(e) => setEndDay(e.target.value)} />
          </Field>
        </div>
        <Field label="Goal" hint="Optional" error={errors.goal}>
          <textarea className={inputClass} rows={3} value={goal} aria-invalid={Boolean(errors.goal)} onChange={(e) => setGoal(e.target.value)} />
        </Field>
        {failure && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {failure.message}
          </p>
        )}
        {/* Enter in a field saves, as the footer's button does. */}
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}
