import { DndContext, DragOverlay, pointerWithin, rectIntersection, type Announcements, type CollisionDetection, type DragEndEvent } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useUpdateTask } from '@/api/tickets'
import type { ProjectSummary, Sprint, TaskView, User } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { columnLabel, columnsOf } from '@/lib/boardColumns'
import { SPACE_DRAG_KEYS, useDragSensors, zoneKeyboardCoordinates } from '@/lib/dragSensors'
import { sortSprints, sprintTotals } from '@/lib/sprints'
import { useNow } from '@/lib/useNow'
import { usePermission } from '@/lib/usePermission'
import { TicketRow } from '@/pages/projects/TicketRow'
import { sprintPlanTasks } from '@/pages/projects/taskFilters'
import { SprintSection, type MoveTarget } from './SprintSection'

/** What a manager can do to sprints (the sheets, Task 5); null for everyone else, and then no sprint buttons show. */
export type SprintActions = { create(): void; edit(s: Sprint): void; start(s: Sprint): void; complete(s: Sprint): void; remove(s: Sprint): void } | null

/** Each section is a drop zone: `sprint:<id>`, and Backlog `sprint:none`. */
const ZONE = 'sprint:'
const BACKLOG = 'sprint:none'

/** The section under the pointer; from the keyboard (no pointer), the one the dragged row sits in. */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  return hits.length > 0 ? hits : rectIntersection(args)
}

/**
 * The Sprints view (sprints spec §6.1, agile projects): the active sprint, the planned ones by start date, then
 * Backlog (unfinished tasks in no sprint). Whoever may manage the project's tasks moves a task between sections by
 * dragging its handle (mouse, touch, or Space and ↑ ↓) or with its Move to; a move shows at once and goes back if it's
 * refused. `tasks` are the rows the filters leave; `allTasks` give each section's totals.
 */
export function SprintPlan({ project, tasks, allTasks, sprints, users, actions }: { project: ProjectSummary; tasks: TaskView[]; allTasks: TaskView[]; sprints: Sprint[]; users: User[]; actions: SprintActions }) {
  const check = usePermission()
  const canMove = check('task.manage', { project })
  const update = useUpdateTask()
  const sensors = useDragSensors(SPACE_DRAG_KEYS, zoneKeyboardCoordinates)
  // "4 days left" turns over at midnight.
  const now = useNow(60_000)
  // Moves still saving, by task key: shown at once, until the save (and the reload after it) lands or fails.
  const [pending, setPending] = useState<Record<string, string | null>>({})
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)

  const open = sortSprints(sprints).filter((s) => s.state !== 'closed')
  const zoneOf = (t: TaskView) => (t.sprintId && open.some((s) => s.id === t.sprintId) ? ZONE + t.sprintId : BACKLOG)
  const personOf = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? 'Unknown person') : null)
  const nameOf = (zone: string | number) => (zone === BACKLOG ? 'Backlog' : (open.find((s) => ZONE + s.id === zone)?.name ?? ''))
  const moved = (list: TaskView[]) => list.map((t) => (t.key in pending ? { ...t, sprintId: pending[t.key] ?? null } : t))
  // In board order, as the List: the project's columns, then rank.
  const columns = columnsOf(project).map((c) => c.id)
  const rows = sprintPlanTasks(moved(tasks), sprints).sort((a, b) => columns.indexOf(a.status) - columns.indexOf(b.status) || a.rank - b.rank)
  const all = moved(allTasks)
  const backlogCount = sprintPlanTasks(all, sprints).filter((t) => !t.archivedAt && zoneOf(t) === BACKLOG).length
  const targets: MoveTarget[] = [...open.map((s) => ({ zone: ZONE + s.id, name: s.name, sprintId: s.id })), { zone: BACKLOG, name: 'Backlog', sprintId: null }]

  const move = (task: TaskView, sprintId: string | null) => {
    setError(null)
    setPending((p) => ({ ...p, [task.key]: sprintId }))
    update
      .mutateAsync({ key: task.key, patch: { sprintId } })
      .catch((e: Error) => setError(e.message))
      .finally(() =>
        // A later move of the same task keeps its own.
        setPending((p) => {
          if (p[task.key] !== sprintId) return p
          const { [task.key]: _done, ...rest } = p
          return rest
        }),
      )
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${active.id}.`,
    onDragOver: ({ active, over }) => (over ? `${active.id} is over ${nameOf(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `Dropped ${active.id} in ${nameOf(over.id)}.` : `Cancelled moving ${active.id}.`),
    onDragCancel: ({ active }) => `Cancelled moving ${active.id}.`,
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null)
    const task = rows.find((t) => t.key === active.id)
    // A drop on its own section changes nothing: there's no order inside a section.
    if (!task || !over || over.id === zoneOf(task)) return
    move(task, over.id === BACKLOG ? null : String(over.id).slice(ZONE.length))
  }
  const held = dragging ? rows.find((t) => t.key === dragging) : undefined
  const create = actions && (
    <Button variant="secondary" onClick={actions.create}>
      <Plus aria-hidden className="size-4" /> Create sprint
    </Button>
  )
  const section = (sprint: Sprint | null) => {
    const zone = sprint ? ZONE + sprint.id : BACKLOG
    return (
      <SprintSection
        key={zone}
        sprint={sprint}
        zone={zone}
        rows={rows.filter((t) => zoneOf(t) === zone)}
        totals={sprint ? sprintTotals(all, sprint.id) : { tasks: backlogCount, points: 0, donePoints: 0 }}
        now={now}
        board={project.board}
        users={users}
        canMove={canMove}
        targets={targets}
        onMove={move}
        actions={actions}
        running={open.some((s) => s.state === 'active')}
      />
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      accessibility={{ announcements, screenReaderInstructions: { draggable: 'To move a task to another sprint, press Space, use the up and down arrow keys, and press Space again. Press Escape to cancel.' } }}
      onDragStart={({ active }) => setDragging(String(active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="space-y-6">
        {sprints.length === 0 && <EmptyState action={create}>No sprints yet.</EmptyState>}
        {open.map(section)}
        {sprints.length > 0 && create && <div>{create}</div>}
        {section(null)}
      </div>
      <DragOverlay>
        {held && (
          <div className="cursor-grabbing rounded-lg border border-line bg-surface shadow-xl">
            <TicketRow ticket={held} assignee={personOf(held.assigneeId)} variant="row" statusName={project.board && columnLabel(project, held.status)} statusCategory={held.category} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
