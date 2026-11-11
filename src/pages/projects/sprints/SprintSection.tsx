import { useDraggable, useDroppable } from '@dnd-kit/core'
import clsx from 'clsx'
import { ArrowRightLeft, GripVertical, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import type { BoardColumn, Sprint, TaskView, User } from '@/api/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { MenuPanel, menuItemClass } from '@/components/ui/Menu'
import { columnLabel } from '@/lib/boardColumns'
import { formatDayMonth } from '@/lib/format'
import { sprintDays } from '@/lib/sprints'
import { TicketRow } from '@/pages/projects/TicketRow'
import { count } from './count'
import type { SprintActions } from './SprintPlan'

/** Where a task can be moved: an active or planned sprint, or Backlog (`sprintId` null). */
export type MoveTarget = { zone: string; name: string; sprintId: string | null }
/** The row (by task key) whose Move to or drag handle takes focus once it's drawn. */
export type RowFocus = { key: string; control: 'move' | 'drag' }

/** A row's Move to: the other active and planned sprints and Backlog, in a MenuPanel (a bottom sheet on phones). */
function MoveTo({ task, targets, onMove, triggerRef }: { task: TaskView; targets: MoveTarget[]; onMove: (task: TaskView, sprintId: string | null) => void; triggerRef: RefObject<HTMLButtonElement | null> }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <IconButton ref={triggerRef} label={`Move to: ${task.key}`} title="Move to" icon={ArrowRightLeft} size="sm" touch className="me-2" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} />
      <MenuPanel open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} label={`Move ${task.key} to`} className="p-1.5 sm:w-52">
        <p className="px-3 pb-1 pt-1.5 text-xs font-medium text-fg-muted">Move {task.key} to</p>
        {targets.map((target) => (
          <button
            key={target.zone}
            type="button"
            role="menuitem"
            className={menuItemClass}
            onClick={() => {
              setOpen(false)
              onMove(task, target.sprintId)
            }}
          >
            {target.name}
          </button>
        ))}
      </MenuPanel>
    </>
  )
}

/**
 * One task: a drag handle from `md` up and Move to for whoever may plan; the row itself opens the task. A moved row is
 * a new one in its new section, so `focusOn` puts focus back on the control that moved it (UX Phase 5A).
 */
function SprintRow({
  task,
  assignee,
  statusName,
  canMove,
  targets,
  onMove,
  focusOn,
  onFocused,
}: {
  task: TaskView
  assignee: string | null
  statusName?: string
  canMove: boolean
  targets: MoveTarget[]
  onMove: (task: TaskView, sprintId: string | null) => void
  focusOn: RowFocus['control'] | null
  onFocused: () => void
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useDraggable({ id: task.key, disabled: !canMove })
  const handleRef = useRef<HTMLButtonElement | null>(null)
  const moveRef = useRef<HTMLButtonElement>(null)
  // Only when asked: onFocused is a new function each render.
  useEffect(() => {
    if (!focusOn) return
    ;(focusOn === 'drag' ? handleRef : moveRef).current?.focus()
    onFocused()
  }, [focusOn])
  return (
    <li ref={setNodeRef} className={clsx('flex items-center', isDragging && 'opacity-40')}>
      {canMove && (
        // Phones move with Move to: a press and hold would fight the scroll on a narrow row.
        <IconButton
          ref={(node) => {
            setActivatorNodeRef(node)
            handleRef.current = node
          }}
          label={`Drag ${task.key}`}
          title="Drag to another sprint"
          icon={GripVertical}
          size="sm"
          className="ms-2 cursor-grab touch-none max-md:hidden"
          {...attributes}
          {...listeners}
        />
      )}
      <div className="min-w-0 flex-1">
        <TicketRow ticket={task} assignee={assignee} variant="row" statusName={statusName} statusCategory={task.category} />
      </div>
      {canMove && <MoveTo task={task} targets={targets} onMove={onMove} triggerRef={moveRef} />}
    </li>
  )
}

/** A sprint's ⋯: Edit sprint, and Delete sprint while it's planned. */
function SprintMenu({ sprint, actions }: { sprint: Sprint; actions: NonNullable<SprintActions> }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const pick = (run: (s: Sprint) => void) => () => {
    setOpen(false)
    run(sprint)
  }
  return (
    <>
      <IconButton ref={triggerRef} label={`Sprint actions: ${sprint.name}`} title="Sprint actions" icon={MoreHorizontal} size="sm" touch aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} />
      <MenuPanel open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} label="Sprint actions" className="p-1.5 sm:w-48">
        <button type="button" role="menuitem" className={menuItemClass} onClick={pick(actions.edit)}>
          <Pencil aria-hidden className="size-4 shrink-0" /> Edit sprint
        </button>
        {sprint.state === 'planned' && (
          <button type="button" role="menuitem" className={clsx(menuItemClass, 'text-red-600 dark:text-red-400')} onClick={pick(actions.remove)}>
            <Trash2 aria-hidden className="size-4 shrink-0" /> Delete sprint
          </button>
        )}
      </MenuPanel>
    </>
  )
}

/**
 * One section of the Sprints view, and the zone a dragged task drops into: a sprint (name, Active or Planned, dates,
 * days left, goal, totals, and for managers Start or Complete and ⋯) or Backlog. The totals count the sprint's own
 * tasks whatever the filters; the rows are what the filters leave.
 */
export function SprintSection({
  sprint,
  zone,
  rows,
  totals,
  now,
  board,
  users,
  canMove,
  targets,
  onMove,
  focus,
  onFocused,
  actions,
  running,
}: {
  /** null: Backlog. */
  sprint: Sprint | null
  zone: string
  rows: TaskView[]
  totals: { tasks: number; points: number; donePoints: number }
  now: Date
  board: BoardColumn[] | undefined
  users: User[]
  canMove: boolean
  /** Every place a task can go; each row leaves out its own. */
  targets: MoveTarget[]
  onMove: (task: TaskView, sprintId: string | null) => void
  /** The moved row to focus once it's drawn here. */
  focus: RowFocus | null
  onFocused: () => void
  actions: SprintActions
  /** A sprint is active, so no other can start. */
  running: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: zone, disabled: !canMove })
  const headingId = useId()
  const nameOf = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? 'Unknown person') : null)
  const others = targets.filter((t) => t.zone !== zone)
  const days = sprint?.state === 'active' ? sprintDays(sprint, now) : null
  const summary = sprint ? [count(totals.tasks, 'task'), count(totals.points, 'point'), sprint.state === 'active' && `${count(totals.donePoints, 'point')} done`].filter(Boolean).join(' · ') : count(totals.tasks, 'task')
  const blurb = sprint ? sprint.goal.trim() : 'Tasks in no sprint'

  let list
  if (rows.length > 0) {
    list = (
      <ul className="divide-y divide-line-subtle">
        {rows.map((task) => (
          <SprintRow key={task.id} task={task} assignee={nameOf(task.assigneeId)} statusName={board && columnLabel({ board }, task.status)} canMove={canMove} targets={others} onMove={onMove} focusOn={focus?.key === task.key ? focus.control : null} onFocused={onFocused} />
        ))}
      </ul>
    )
  } else if (totals.tasks > 0) list = <p className="px-4 py-6 text-center text-sm text-fg-muted sm:px-5">No tasks match these filters.</p>
  else {
    list = (
      <p className="m-3 rounded-lg border border-dashed border-line-strong px-4 py-6 text-center text-sm text-fg-muted">
        {canMove ? 'Drag tasks here, or use a task’s Move to.' : 'No tasks here.'}
      </p>
    )
  }

  return (
    <section ref={setNodeRef} aria-labelledby={headingId} className={clsx('rounded-xl border bg-surface shadow-sm transition-shadow', isOver ? 'border-brand-500 ring-2 ring-brand-500/30' : 'border-line')}>
      <header className="border-b border-line-subtle px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 id={headingId} className="text-sm font-semibold text-fg">
            {sprint?.name ?? 'Backlog'}
          </h2>
          {sprint && <Badge tone={sprint.state === 'active' ? 'info' : 'neutral'}>{sprint.state === 'active' ? 'Active' : 'Planned'}</Badge>}
          {sprint && (
            <span className="text-xs tabular-nums text-fg-muted">
              {formatDayMonth(sprint.startDate)} – {formatDayMonth(sprint.endDate)}
            </span>
          )}
          {days && (
            <>
              <span aria-hidden className="text-xs text-fg-muted">
                ·
              </span>
              {/* Past its end it still runs until someone completes it: worth a second look. */}
              <span className={clsx('text-xs tabular-nums', days.startsWith('Ended') ? 'text-amber-700 dark:text-amber-300' : 'text-fg-muted')}>{days}</span>
            </>
          )}
          {sprint && actions && (
            <div className="ms-auto flex items-center gap-1.5">
              {sprint.state === 'planned' && !running && (
                <Button variant="secondary" className="py-1.5 max-md:touch-target" onClick={() => actions.start(sprint)}>
                  Start sprint
                </Button>
              )}
              {sprint.state === 'active' && (
                <Button variant="secondary" className="py-1.5 max-md:touch-target" onClick={() => actions.complete(sprint)}>
                  Complete sprint
                </Button>
              )}
              <SprintMenu sprint={sprint} actions={actions} />
            </div>
          )}
        </div>
        {blurb && <p className="mt-1 text-sm text-fg-secondary">{blurb}</p>}
        <p className="mt-1 text-xs tabular-nums text-fg-muted">{summary}</p>
      </header>
      {list}
    </section>
  )
}
