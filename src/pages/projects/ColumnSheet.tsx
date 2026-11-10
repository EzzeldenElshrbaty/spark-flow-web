import { useState } from 'react'
import { useAddColumn, useSetBoard } from '@/api/projects'
import type { BoardColumn, StatusCategory } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { Field, inputClass, selectClass } from '@/components/ui/Field'
import { Sheet, SheetCancelButton } from '@/components/ui/Sheet'
import { columnProblem, doneChange } from '@/lib/boardColumns'
import { useFormCheck } from '@/lib/useFormCheck'
import { CATEGORIES } from '@/lib/statuses'
import { SegmentedControl } from '@/components/ui/SegmentedControl'

/**
 * Add column (a name, a type and where it goes), or a column's details (its name and type). The type decides what
 * "done" means for the tasks in it: progress, overdue, timers and My tasks follow it.
 */
export function ColumnSheet({ projectId, columns, column, count = 0, onClose }: { projectId: string; columns: BoardColumn[]; column?: BoardColumn; /** The tasks in `column`, for the done warning. */ count?: number; onClose: () => void }) {
  const add = useAddColumn()
  const setBoard = useSetBoard()
  const [label, setLabel] = useState(column?.label ?? '')
  const [category, setCategory] = useState<StatusCategory>(column?.category ?? 'inProgress')
  const [after, setAfter] = useState(columns.at(-1)?.id ?? '')
  // Closing with changes asks first (UX Phase 1, 1.2).
  const dirty = label !== (column?.label ?? '') || category !== (column?.category ?? 'inProgress') || after !== (columns.at(-1)?.id ?? '')
  const pending = add.isPending || setBoard.isPending
  const failure = (add.error ?? setBoard.error) as Error | null

  const next = column
    ? columns.map((c) => (c.id === column.id ? { ...c, label: label.trim(), category } : c))
    : (() => {
        const at = columns.findIndex((c) => c.id === after) + 1
        return [...columns.slice(0, at), { id: 'new', label: label.trim(), category }, ...columns.slice(at)]
      })()
  // Each problem shows by what it's about, from the first Save on (UX Phase 4, 4.4).
  const problem = columnProblem(next)
  const about = (field: 'label' | 'category' | 'board') => (problem?.field === field ? problem.message : undefined)
  const { errors, attempt, formRef } = useFormCheck({ label: about('label'), category: about('category'), board: about('board') })

  const save = () => {
    // Enter again while it saves sends nothing (final review).
    if (pending || !attempt()) return
    if (column) setBoard.mutate({ id: projectId, columns: next }, { onSuccess: onClose })
    else add.mutate({ projectId, input: { label: label.trim(), category, after: after || undefined } }, { onSuccess: onClose })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      dirty={dirty}
      discardQuestion={column ? 'Discard your changes?' : 'Discard this new column?'}
      title={column ? 'Column details' : 'Add column'}
      description="The type decides what counts as done: progress, overdue, timers and My tasks follow it."
      footer={
        <>
          <SheetCancelButton disabled={pending} />
          <Button onClick={save} disabled={pending}>
            {column ? (pending ? 'Saving…' : 'Save') : pending ? 'Adding…' : 'Add column'}
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
        <Field label="Name" required error={errors.label}>
          <input className={inputClass} value={label} maxLength={30} aria-invalid={Boolean(errors.label)} onChange={(e) => setLabel(e.target.value)} placeholder="QA" />
        </Field>
        <fieldset aria-describedby={errors.category ? 'column-type-error' : undefined} data-invalid={errors.category ? '' : undefined}>
          <legend className="mb-1.5 text-sm font-medium text-fg-secondary">Type</legend>
          <SegmentedControl kind="form" label="Type" value={category} onChange={setCategory} options={CATEGORIES.map((c) => ({ value: c.category, label: c.label }))} />
          {errors.category && (
            <p id="column-type-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
              {errors.category}
            </p>
          )}
          {/* Before what counts as done changes for the tasks already here (UX Phase 4, 4.10). */}
          {column && doneChange(column.category, category, count) && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">{doneChange(column.category, category, count)}</p>}
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
        {(errors.board ?? failure) && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {errors.board ?? failure!.message}
          </p>
        )}
        {/* Enter in a field saves, as the footer's button does. */}
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}
