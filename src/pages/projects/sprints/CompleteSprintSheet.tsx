import { useState } from 'react'
import { useCompleteSprint } from '@/api/sprints'
import type { Sprint, TaskView } from '@/api/types'
import { announce } from '@/components/sf/Announcer'
import { Button } from '@/components/ui/Button'
import { Field, selectClass } from '@/components/ui/Field'
import { Sheet, SheetCancelButton } from '@/components/ui/Sheet'
import { sortSprints, sprintTotals } from '@/lib/sprints'
import { count } from './count'

/**
 * Complete sprint: the done tasks stay with it; the unfinished ones go to the next planned sprint (the default), another
 * planned one, a new sprint or the backlog, in the same save. With nothing unfinished there's nothing to move.
 * `tasks` are the project's, whatever the filters.
 */
export function CompleteSprintSheet({ sprint, sprints, tasks, onClose }: { sprint: Sprint; sprints: Sprint[]; tasks: TaskView[]; onClose: () => void }) {
  const complete = useCompleteSprint()
  const totals = sprintTotals(tasks, sprint.id)
  const unfinished = totals.tasks - totals.done
  // The next planned sprint first, as the Sprints view lists them; "A new sprint" and Backlog (value '', sent as null) last.
  const planned = sortSprints(sprints).filter((s) => s.state === 'planned')
  const [moveTo, setMoveTo] = useState(planned[0]?.id ?? 'new')

  const save = () => {
    if (complete.isPending) return
    // Nothing unfinished: nothing moves, and no sprint is made for it.
    const target = unfinished === 0 || moveTo === '' ? null : moveTo
    complete.mutate(
      { id: sprint.id, moveTo: target },
      {
        // Read out once the sheet has closed (UX Phase 5A, 5.12).
        onSuccess: () => {
          onClose()
          announce(`${sprint.name} completed.`)
        },
      },
    )
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Complete sprint"
      description={sprint.name}
      footer={
        <>
          <SheetCancelButton disabled={complete.isPending} />
          <Button onClick={save} disabled={complete.isPending}>
            {complete.isPending ? 'Completing…' : 'Complete sprint'}
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
        <p className="text-sm tabular-nums text-fg-secondary">
          {count(totals.done, 'task')} done · {unfinished} not done
        </p>
        {unfinished > 0 && (
          <Field label={`Move the ${unfinished} unfinished ${unfinished === 1 ? 'task' : 'tasks'} to`}>
            <select className={selectClass} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              {planned.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="new">A new sprint</option>
              <option value="">Backlog</option>
            </select>
          </Field>
        )}
        {complete.error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {(complete.error as Error).message}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}
