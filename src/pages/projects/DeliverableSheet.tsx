import { useState } from 'react'
import { useCreateDeliverable, useUpdateDeliverable } from '@/api/projects'
import type { Deliverable, DeliverablePatch, Phase, ProjectSummary } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Field, inputClass, selectClass } from '@/components/ui/Field'
import { Sheet, SheetCancelButton } from '@/components/ui/Sheet'
import { byOrder } from './phases'

/** Add a deliverable, or edit one (`deliverable`): what the client gets, when, and in which phase. */
export function DeliverableSheet({ project, phases, deliverable, onClose }: { project: ProjectSummary; phases: Phase[]; deliverable?: Deliverable; onClose: () => void }) {
  const create = useCreateDeliverable()
  const update = useUpdateDeliverable()
  const [title, setTitle] = useState(deliverable?.title ?? '')
  const [phaseId, setPhaseId] = useState(deliverable ? (deliverable.phaseId ?? '') : (project.currentPhaseId ?? ''))
  const [due, setDue] = useState((deliverable?.dueDate ?? project.dueDate).slice(0, 10))
  const [error, setError] = useState<string | null>(null)
  // Closing with changes asks first (UX Phase 1, 1.2).
  const dirty =
    title !== (deliverable?.title ?? '') ||
    phaseId !== (deliverable ? (deliverable.phaseId ?? '') : (project.currentPhaseId ?? '')) ||
    due !== (deliverable?.dueDate ?? project.dueDate).slice(0, 10)
  const pending = create.isPending || update.isPending
  const failure = (create.error ?? update.error) as Error | null

  const save = () => {
    if (!title.trim()) return setError('Give the deliverable a title.')
    if (!due) return setError('Pick a due date.')
    setError(null)
    const fields = { title: title.trim(), phaseId: phaseId || null, dueDate: new Date(`${due}T00:00:00.000Z`).toISOString() }
    if (!deliverable) return create.mutate({ projectId: project.id, ...fields }, { onSuccess: onClose })
    // Only what changed (a due date by its day: a stored one may carry a time).
    const patch: DeliverablePatch = {}
    if (fields.title !== deliverable.title) patch.title = fields.title
    if (fields.phaseId !== deliverable.phaseId) patch.phaseId = fields.phaseId
    if (due !== deliverable.dueDate.slice(0, 10)) patch.dueDate = fields.dueDate
    if (Object.keys(patch).length === 0) return onClose()
    update.mutate({ id: deliverable.id, patch }, { onSuccess: onClose })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      dirty={dirty}
      discardQuestion={deliverable ? 'Discard your changes?' : 'Discard this new deliverable?'}
      title={deliverable ? 'Edit deliverable' : 'Add deliverable'}
      description={project.name}
      footer={
        <>
          <SheetCancelButton />
          <Button onClick={save} disabled={pending}>
            {deliverable ? (pending ? 'Saving…' : 'Save deliverable') : pending ? 'Adding…' : 'Add deliverable'}
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
        <Field label="Title" required error={error && !title.trim() ? error : undefined}>
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Phase">
          <select className={selectClass} value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
            <option value="">No phase</option>
            {byOrder(phases).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due" required error={error && title.trim() ? error : undefined}>
          <input type="date" className={inputClass} value={due} onChange={(e) => setDue(e.target.value)} />
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
