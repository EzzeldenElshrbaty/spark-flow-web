import { useState } from 'react'
import { useAddColumn, useSetBoard } from '@/api/projects'
import type { BoardColumn, StatusCategory } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Field, inputClass, selectClass } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { columnErrors } from '@/lib/boardColumns'
import { CATEGORIES } from '@/lib/statuses'

/**
 * Add column (a name, a type and where it goes), or a column's details (its name and type). The type decides what
 * "done" means for the tasks in it: progress, overdue, timers and My tasks follow it.
 */
export function ColumnSheet({ projectId, columns, column, onClose }: { projectId: string; columns: BoardColumn[]; column?: BoardColumn; onClose: () => void }) {
  const add = useAddColumn()
  const setBoard = useSetBoard()
  const [label, setLabel] = useState(column?.label ?? '')
  const [category, setCategory] = useState<StatusCategory>(column?.category ?? 'inProgress')
  const [after, setAfter] = useState(columns.at(-1)?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const pending = add.isPending || setBoard.isPending
  const failure = (add.error ?? setBoard.error) as Error | null

  const save = () => {
    const next = column
      ? columns.map((c) => (c.id === column.id ? { ...c, label: label.trim(), category } : c))
      : (() => {
          const at = columns.findIndex((c) => c.id === after) + 1
          return [...columns.slice(0, at), { id: 'new', label: label.trim(), category }, ...columns.slice(at)]
        })()
    const problem = columnErrors(next)
    setError(problem)
    if (problem) return
    if (column) setBoard.mutate({ id: projectId, columns: next }, { onSuccess: onClose })
    else add.mutate({ projectId, input: { label: label.trim(), category, after: after || undefined } }, { onSuccess: onClose })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={column ? 'Column details' : 'Add column'}
      description="The type decides what counts as done: progress, overdue, timers and My tasks follow it."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {column ? (pending ? 'Saving…' : 'Save') : pending ? 'Adding…' : 'Add column'}
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
        <Field label="Name" required>
          <input className={inputClass} value={label} maxLength={30} onChange={(e) => setLabel(e.target.value)} placeholder="QA" />
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-fg-secondary">Type</legend>
          <div className="inline-flex rounded-lg border border-line p-0.5" role="radiogroup" aria-label="Type">
            {CATEGORIES.map((c) => (
              <button
                key={c.category}
                type="button"
                role="radio"
                aria-checked={category === c.category}
                onClick={() => setCategory(c.category)}
                className={`rounded-md px-3 py-1.5 text-sm ${category === c.category ? 'bg-surface-muted font-medium text-fg' : 'text-fg-secondary hover:text-fg'}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>
        {!column && (
          <Field label="Place">
            <select className={selectClass} value={after} onChange={(e) => setAfter(e.target.value)} aria-label="Place">
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  After {c.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        {(error ?? failure) && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error ?? failure!.message}
          </p>
        )}
      </form>
    </Sheet>
  )
}
