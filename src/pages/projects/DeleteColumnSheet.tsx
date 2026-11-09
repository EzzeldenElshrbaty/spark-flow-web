import { useState } from 'react'
import { useDeleteColumn } from '@/api/projects'
import type { BoardColumn } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Field, selectClass } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { defaultMoveTo, doneChange } from '@/lib/boardColumns'

/** "Delete {name}?": its tasks move to the column you pick (the same type's first by default), in the same save. */
export function DeleteColumnSheet({ projectId, columns, column, count, onClose }: { projectId: string; columns: BoardColumn[]; column: BoardColumn; count: number; onClose: () => void }) {
  const remove = useDeleteColumn()
  const [moveTo, setMoveTo] = useState(() => defaultMoveTo(columns, column.id))
  const others = columns.filter((c) => c.id !== column.id)
  const target = others.find((c) => c.id === moveTo)
  // Moving them to a column of another type can change what counts as done (UX Phase 4, 4.10).
  const warning = target ? doneChange(column.category, target.category, count, target.label) : null
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Delete ${column.label}?`}
      description={count > 0 ? `Its ${count} ${count === 1 ? 'task moves' : 'tasks move'} to the column you pick.` : 'Any tasks in it move to the column you pick.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate({ projectId, columnId: column.id, moveTo }, { onSuccess: onClose })}>
            {remove.isPending ? 'Deleting…' : 'Delete column'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {others.length > 0 && (
          <Field label="Move them to">
            <select className={selectClass} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        {warning && <p className="text-sm text-amber-700 dark:text-amber-300">{warning}</p>}
        {remove.error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {(remove.error as Error).message}
          </p>
        )}
      </div>
    </Sheet>
  )
}
