import { DndContext, DragOverlay, pointerWithin, rectIntersection, type Announcements, type CollisionDetection, type DragEndEvent } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useUpdateTask } from '@/api/tickets'
import type { ProjectSummary, Sprint, TaskView, User } from '@/api/types'
import { announce } from '@/components/sf/Announcer'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { columnLabel, columnsOf } from '@/lib/boardColumns'
import { SPACE_DRAG_KEYS, useDragSensors, zoneKeyboardCoordinates } from '@/lib/dragSensors'
import { sortSprints, sprintTotals } from '@/lib/sprints'
import { useNow } from '@/lib/useNow'
import { usePermission } from '@/lib/usePermission'
import { prunePending, withPending, type PendingMoves } from '@/pages/projects/boardMove'
import { TicketRow } from '@/pages/projects/TicketRow'
import { sprintPlanTasks } from '@/pages/projects/taskFilters'
import { SprintSection, type MoveTarget, type RowFocus } from './SprintSection'

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
 * Backlog (unfinished tasks in no open sprint). Whoever may manage the project's tasks moves a task between sections by
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
  // Moves shown at once, as the board's drops: each until the server's copy of its task changes (the save landed, or
  // someone else moved it) or its save fails. Not until the save's promise settles: a live update can restart the
  // reload, and the row would jump back for a moment (and lose focus).
  const [pending, setPending] = useState<PendingMoves>({})
  const live = useMemo(() => prunePending(pending, allTasks), [pending, allTasks])
  useEffect(() => {
    if (Object.keys(live).length !== Object.keys(pending).length) setPending(live)
  }, [live, pending])
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  // A moved row is drawn afresh in its new section (and again if a refusal puts it back): this is the control it
  // takes focus on once it's there, its Move to after a pick or its handle after a drop (UX Phase 5A).
  const [focus, setFocus] = useState<RowFocus | null>(null)

  const open = sortSprints(sprints).filter((s) => s.state !== 'closed')
  const zoneOf = (t: TaskView) => (t.sprintId && open.some((s) => s.id === t.sprintId) ? ZONE + t.sprintId : BACKLOG)
  const personOf = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? 'Unknown person') : null)
  const nameOf = (zone: string | number) => (zone === BACKLOG ? 'Backlog' : (open.find((s) => ZONE + s.id === zone)?.name ?? ''))
  // In board order, as the List: the project's columns, then rank.
  const columns = columnsOf(project).map((c) => c.id)
  const rows = sprintPlanTasks(withPending(tasks, live), sprints).sort((a, b) => columns.indexOf(a.status) - columns.indexOf(b.status) || a.rank - b.rank)
  const all = withPending(allTasks, live)
  const backlogCount = sprintPlanTasks(all, sprints).filter((t) => !t.archivedAt && zoneOf(t) === BACKLOG).length
  const targets: MoveTarget[] = [...open.map((s) => ({ zone: ZONE + s.id, name: s.name, sprintId: s.id })), { zone: BACKLOG, name: 'Backlog', sprintId: null }]

  /** Moves a task to a sprint (null: Backlog), from its Move to or a drag; `control` keeps focus with the row. */
  const move = (task: TaskView, sprintId: string | null, control: RowFocus['control']) => {
    setError(null)
    setPending((p) => ({ ...p, [task.key]: { patch: { sprintId }, updatedAt: task.updatedAt } }))
    // A done task sent to Backlog leaves the view (done tasks in no sprint aren't listed): nothing to focus there.
    if (sprintId !== null || task.category !== 'done') setFocus({ key: task.key, control })
    update.mutateAsync({ key: task.key, patch: { sprintId } }).then(
      () => {
        // A drop says so itself ("Dropped NEX-108 in Sprint 15.").
        if (control === 'move') announce(sprintId ? `Moved ${task.key} to ${open.find((s) => s.id === sprintId)?.name ?? 'the sprint'}.` : `Moved ${task.key} to the backlog.`)
      },
      (e: Error) => {
        // Back where it was (unless it has moved again since), saying why, with focus following it there.
        setPending((p) => {
          if (p[task.key]?.patch.sprintId !== sprintId) return p
          const { [task.key]: _failed, ...rest } = p
          return rest
        })
        setError(e.message)
        setFocus({ key: task.key, control })
      },
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
    move(task, over.id === BACKLOG ? null : String(over.id).slice(ZONE.length), 'drag')
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
        onMove={(task, sprintId) => move(task, sprintId, 'move')}
        focus={focus}
        onFocused={() => setFocus(null)}
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
