import { useState } from 'react'
import { useCreateDeliverable } from '@/api/projects'
import type { Phase, ProjectSummary } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Field, inputClass, selectClass } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { byOrder } from './phases'

/** Add a deliverable: what the client gets, when, and in which phase. */
export function DeliverableSheet({ project, phases, onClose }: { project: ProjectSummary; phases: Phase[]; onClose: () => void }) {
  const create = useCreateDeliverable()
  const [title, setTitle] = useState('')
  const [phaseId, setPhaseId] = useState(project.currentPhaseId ?? '')
  const [due, setDue] = useState(project.dueDate.slice(0, 10))
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    if (!title.trim()) return setError('Give the deliverable a title.')
    if (!due) return setError('Pick a due date.')
    setError(null)
    create.mutate(
      { projectId: project.id, title: title.trim(), phaseId: phaseId || null, dueDate: new Date(`${due}T00:00:00.000Z`).toISOString() },
      { onSuccess: onClose },
    )
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Add deliverable"
      description={project.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={create.isPending}>
            {create.isPending ? 'Adding…' : 'Add deliverable'}
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
        {create.error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {(create.error as Error).message}
          </p>
        )}
      </form>
    </Sheet>
  )
}
