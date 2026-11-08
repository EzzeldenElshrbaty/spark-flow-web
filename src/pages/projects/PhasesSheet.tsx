import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useCreatePhase, useRemovePhase, useReorderPhases, useUpdatePhase } from '@/api/projects'
import type { Phase, PhaseStatus, ProjectSummary } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { DeleteDialog } from '@/components/ui/DeleteDialog'
import { inputClass, selectClass } from '@/components/ui/Field'
import { Sheet, useSheetClose } from '@/components/ui/Sheet'
import { byOrder, moveDown, moveUp } from './phases'

const statuses: [PhaseStatus, string][] = [
  ['notStarted', 'Not started'],
  ['inProgress', 'In progress'],
  ['done', 'Done'],
]
const day = (iso: string) => iso.slice(0, 10)
const toIso = (value: string) => new Date(`${value}T00:00:00.000Z`).toISOString()

type Draft = { name: string; startDate: string; dueDate: string; status: PhaseStatus }
const draftOf = (p: Phase): Draft => ({ name: p.name, startDate: day(p.startDate), dueDate: day(p.dueDate), status: p.status })

function PhaseRow({
  phase,
  first,
  last,
  onMove,
  onDelete,
  onEditing,
}: {
  phase: Phase
  first: boolean
  last: boolean
  onMove: (by: -1 | 1) => void
  onDelete: () => void
  /** Whether this row holds an edit not saved yet, so closing the sheet asks first (UX Phase 1, 1.2). */
  onEditing: (editing: boolean) => void
}) {
  const update = useUpdatePhase()
  const [draft, setDraft] = useState(() => draftOf(phase))
  const saved = draftOf(phase)
  const dirty = (Object.keys(draft) as (keyof Draft)[]).some((k) => draft[k] !== saved[k])
  const onEditingRef = useRef(onEditing)
  useEffect(() => {
    onEditingRef.current = onEditing
  })
  useEffect(() => {
    if (!dirty) return
    onEditingRef.current(true)
    return () => onEditingRef.current(false)
  }, [dirty])
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const invalid = !draft.name.trim() ? 'Give the phase a name.' : draft.dueDate < draft.startDate ? 'The due date is before the start date.' : null

  return (
    <li className="space-y-2 py-3">
      <div className="flex items-center gap-2">
        <input className={inputClass} aria-label="Phase name" value={draft.name} onChange={(e) => set('name', e.target.value)} />
        <button type="button" aria-label={`Move ${phase.name} up`} disabled={first} onClick={() => onMove(-1)} className="rounded-md p-2 text-fg-muted hover:bg-surface-muted hover:text-fg disabled:opacity-40">
          <ArrowUp className="size-4" />
        </button>
        <button type="button" aria-label={`Move ${phase.name} down`} disabled={last} onClick={() => onMove(1)} className="rounded-md p-2 text-fg-muted hover:bg-surface-muted hover:text-fg disabled:opacity-40">
          <ArrowDown className="size-4" />
        </button>
        <button type="button" aria-label={`Delete ${phase.name}`} onClick={onDelete} className="rounded-md p-2 text-fg-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15 dark:hover:text-red-400">
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <input type="date" className={inputClass} aria-label="Start" value={draft.startDate} onChange={(e) => set('startDate', e.target.value)} />
        <input type="date" className={inputClass} aria-label="Due" value={draft.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
        <select className={selectClass} aria-label="Status" value={draft.status} onChange={(e) => set('status', e.target.value as PhaseStatus)}>
          {statuses.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {dirty && (
        <div className="flex items-center justify-end gap-2">
          {(invalid || update.error) && <p className="me-auto text-xs text-red-600 dark:text-red-400">{invalid ?? (update.error as Error).message}</p>}
          <Button variant="ghost" onClick={() => setDraft(saved)}>
            Undo
          </Button>
          <Button
            variant="secondary"
            disabled={Boolean(invalid) || update.isPending}
            onClick={() => update.mutate({ id: phase.id, patch: { ...draft, name: draft.name.trim(), startDate: toIso(draft.startDate), dueDate: toIso(draft.dueDate) } })}
          >
            {update.isPending ? 'Saving…' : 'Save phase'}
          </Button>
        </div>
      )}
    </li>
  )
}

/** Manage phases: rename, change dates and status, move up or down, add, delete. Each change saves on its own. */
/** Done closes the sheet, asking first while an edit isn't saved. */
function DoneButton() {
  const close = useSheetClose()
  return <Button onClick={close}>Done</Button>
}

export function PhasesSheet({ project, phases, onClose }: { project: ProjectSummary; phases: Phase[]; onClose: () => void }) {
  const ordered = byOrder(phases)
  const ids = ordered.map((p) => p.id)
  const reorder = useReorderPhases()
  const create = useCreatePhase()
  const remove = useRemovePhase()
  const [deleting, setDeleting] = useState<Phase | null>(null)
  const [name, setName] = useState('')
  // Rows with an edit not saved yet: with one, or a new name typed, closing asks first (UX Phase 1, 1.2).
  const [editing, setEditing] = useState<ReadonlySet<string>>(new Set())
  const markEditing = (id: string, on: boolean) =>
    setEditing((all) => {
      const next = new Set(all)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  const last = ordered.at(-1)

  const add = () => {
    if (!name.trim()) return
    const start = last ? last.dueDate : project.startDate
    create.mutate({ projectId: project.id, name: name.trim(), startDate: start, dueDate: project.dueDate > start ? project.dueDate : start }, { onSuccess: () => setName('') })
  }
  const move = (id: string, by: -1 | 1) => reorder.mutate({ projectId: project.id, ids: by < 0 ? moveUp(ids, id) : moveDown(ids, id) })
  const failure = (reorder.error ?? create.error) as Error | null

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        dirty={editing.size > 0 || name.trim() !== ''}
        variant="drawer"
        title="Manage phases"
        description={`${project.name} · each change saves on its own`}
        footer={<DoneButton />}
      >
        {ordered.length === 0 ? (
          <p className="text-sm text-fg-muted">No phases yet.</p>
        ) : (
          <ol className="divide-y divide-line-subtle">
            {ordered.map((p, i) => (
              // The key carries the saved values, so a row resets to them after a save or a reorder.
              <PhaseRow key={`${p.id}:${p.name}:${p.startDate}:${p.dueDate}:${p.status}`} phase={p} first={i === 0} last={i === ordered.length - 1} onMove={(by) => move(p.id, by)} onDelete={() => setDeleting(p)} onEditing={(on) => markEditing(p.id, on)} />
            ))}
          </ol>
        )}
        <form
          className="mt-4 flex gap-2 border-t border-line-subtle pt-4"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <input className={inputClass} placeholder="New phase name" aria-label="New phase name" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" variant="secondary" disabled={!name.trim() || create.isPending}>
            <Plus className="size-4" /> {create.isPending ? 'Adding…' : 'Add phase'}
          </Button>
        </form>
        {failure && (
          <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
            {failure.message}
          </p>
        )}
      </Sheet>
      {deleting && (
        <DeleteDialog
          title={`Delete ${deleting.name}?`}
          description="Its tasks and deliverables stay in the project, without a phase."
          confirmText={deleting.name}
          removes={[`The ${deleting.name} phase and its dates`]}
          onDelete={() => remove.mutateAsync(deleting.id).then(() => setDeleting(null))}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  )
}
