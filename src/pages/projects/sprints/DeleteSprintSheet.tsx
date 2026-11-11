import { useRemoveSprint } from '@/api/sprints'
import type { Sprint, TaskView } from '@/api/types'
import { announce } from '@/components/sf/Announcer'
import { Button } from '@/components/ui/Button'
import { Sheet, SheetCancelButton } from '@/components/ui/Sheet'
import { sprintTotals } from '@/lib/sprints'

/** "Delete Sprint 16?": a planned sprint goes, its tasks go to the backlog. `tasks` are the project's, whatever the filters. */
export function DeleteSprintSheet({ sprint, tasks, onClose }: { sprint: Sprint; tasks: TaskView[]; onClose: () => void }) {
  const remove = useRemoveSprint()
  const { tasks: held } = sprintTotals(tasks, sprint.id)

  const save = () => {
    if (remove.isPending) return
    remove.mutate(sprint.id, {
      // Read out once the sheet has closed (UX Phase 5A, 5.12).
      onSuccess: () => {
        onClose()
        announce(`${sprint.name} deleted.`)
      },
    })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Delete ${sprint.name}?`}
      description={held > 0 ? `Its ${held} ${held === 1 ? 'task goes' : 'tasks go'} to the backlog.` : undefined}
      footer={
        <>
          <SheetCancelButton disabled={remove.isPending} />
          <Button variant="danger" onClick={save} disabled={remove.isPending}>
            {remove.isPending ? 'Deleting…' : 'Delete sprint'}
          </Button>
        </>
      }
    >
      {remove.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {(remove.error as Error).message}
        </p>
      )}
    </Sheet>
  )
}
