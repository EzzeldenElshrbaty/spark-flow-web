import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import clsx from 'clsx'
import { Inbox } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { TaskView, TicketPatch, TicketStatus, User } from '@/api/types'
import { boardMove } from '@/pages/projects/boardMove'
import { TicketRow } from '@/pages/projects/TicketRow'
import { statuses, statusLabel, statusTint } from '@/pages/projects/ticketPills'

const nameOf = (users: User[], id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? 'Unknown person') : null)
const COLUMN = 'column:'
const byRank = (a: TaskView, b: TaskView) => a.rank - b.rank

/** Pulse columns while the tickets load. */
export function BoardSkeleton() {
  return (
    <div className="relative flex gap-3 overflow-hidden" aria-busy="true">
      {statuses.map(({ status }) => (
        <div key={status} className="h-96 w-[85%] shrink-0 animate-pulse rounded-xl bg-surface-muted md:w-[296px]" />
      ))}
    </div>
  )
}

/** One card on the board; a card the person may move drags with mouse, touch (press and hold) or keyboard (Space). */
function BoardCard({ ticket, assignee, movable }: { ticket: TaskView; assignee: string | null; movable: boolean }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: ticket.key, disabled: !movable })
  // The card is a link: a drag that ends over it must not also open it.
  const dragged = useRef(false)
  useEffect(() => {
    if (isDragging) dragged.current = true
  }, [isDragging])
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={clsx('motion-safe:animate-fade-in', movable && 'cursor-grab rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500', isDragging && 'opacity-40')}
      {...(movable ? { ...attributes, ...listeners, 'aria-roledescription': 'movable task' } : {})}
      onClickCapture={(e) => {
        if (!dragged.current) return
        dragged.current = false
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <TicketRow ticket={ticket} assignee={assignee} variant="card" />
    </li>
  )
}

/** A status column: its header, and the cards as one sortable list that also takes drops when empty. */
function BoardColumn({ status, label, items, users, canMove, hovered }: { status: TicketStatus; label: string; items: TaskView[]; users: User[]; canMove: (t: TaskView) => boolean; hovered: boolean }) {
  const { setNodeRef } = useDroppable({ id: COLUMN + status })
  const hours = Math.round(items.reduce((sum, t) => sum + t.loggedHours, 0) * 10) / 10
  const tint = statusTint[status]
  return (
    <section
      aria-label={`${label}: ${items.length} tasks`}
      className={clsx(
        'relative flex w-[85%] shrink-0 snap-start flex-col overflow-hidden rounded-xl border md:max-h-[calc(100dvh-14rem)] md:w-[296px]',
        tint.border,
        tint.body,
        hovered && 'ring-2 ring-accent/40',
      )}
    >
      <header className={clsx('border-b px-3.5 py-3', tint.head, tint.border)}>
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-fg">
          <span className={clsx('size-2 shrink-0 rounded-full', tint.dot)} aria-hidden />
          <span className="truncate">{label}</span>
          <span className="ms-auto rounded-full bg-surface/80 px-2 py-px text-xs font-medium tabular-nums text-fg-tertiary">{items.length}</span>
        </h2>
        <p className="mt-1 ps-4 text-xs tabular-nums text-fg-muted">
          <span className="font-medium text-fg-secondary">{hours}h</span> logged
        </p>
      </header>
      <SortableContext id={COLUMN + status} items={items.map((t) => t.key)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="min-h-24 flex-1 space-y-2 p-2 md:overflow-y-auto">
          {items.map((ticket) => (
            <BoardCard key={ticket.id} ticket={ticket} assignee={nameOf(users, ticket.assigneeId)} movable={canMove(ticket)} />
          ))}
          {items.length === 0 && (
            <li className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-line-strong/70 px-3 py-8 text-center text-xs text-fg-subtle">
              <Inbox className="size-5" />
              No tasks here
            </li>
          )}
        </ul>
      </SortableContext>
    </section>
  )
}

/**
 * The board: a tinted column per status with its count and hours logged. The columns scroll sideways inside
 * the board; on phones each column takes most of the width and snaps, with the next one peeking in.
 * A card the person may move drags to another column or another place in its column, with mouse, touch or keyboard;
 * the drop shows at once and goes back if saving fails.
 */
export function ProjectBoard({
  tickets,
  users,
  canMove = () => false,
  onMove,
  error,
}: {
  tickets: TaskView[]
  users: User[]
  canMove?: (ticket: TaskView) => boolean
  onMove?: (ticket: TaskView, patch: TicketPatch) => Promise<unknown>
  error?: string | null
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // A press and hold lifts a card on touch screens, so a swipe still scrolls the columns.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [overStatus, setOverStatus] = useState<TicketStatus | null>(null)
  // A drop shows at once; it holds until the saved task comes back with it, or the save fails.
  const [moved, setMoved] = useState<{ key: string; patch: TicketPatch } | null>(null)
  const saved = moved && tickets.some((t) => t.key === moved.key && t.rank === moved.patch.rank && (!moved.patch.status || t.status === moved.patch.status))
  useEffect(() => {
    if (saved) setMoved(null)
  }, [saved])
  const shown = useMemo(() => (moved ? tickets.map((t) => (t.key === moved.key ? { ...t, ...moved.patch } : t)) : tickets), [moved, tickets])
  const columns = statuses.map(({ status, label }) => ({ status, label, items: shown.filter((t) => t.status === status).sort(byRank) }))
  const find = (key: string) => shown.find((t) => t.key === key)
  const columnOf = (id: string) => (id.startsWith(COLUMN) ? (id.slice(COLUMN.length) as TicketStatus) : find(id)?.status)
  const active = activeKey ? find(activeKey) : undefined

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${active.id}.`,
    onDragOver: ({ active, over }) => (over ? `${active.id} is over ${statusLabel(columnOf(String(over.id)) ?? 'todo')}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `Dropped ${active.id} in ${statusLabel(columnOf(String(over.id)) ?? 'todo')}.` : `Cancelled moving ${active.id}.`),
    onDragCancel: ({ active }) => `Cancelled moving ${active.id}.`,
  }

  const onDragStart = ({ active }: DragStartEvent) => setActiveKey(String(active.id))
  const onDragOver = ({ over }: DragOverEvent) => setOverStatus(over ? (columnOf(String(over.id)) ?? null) : null)
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveKey(null)
    setOverStatus(null)
    const ticket = find(String(active.id))
    const to = over ? columnOf(String(over.id)) : undefined
    if (!ticket || !over || !to) return
    const column = columns.find((c) => c.status === to)!.items
    const others = column.filter((t) => t.key !== ticket.key)
    let index = others.length // dropped on the column: last
    if (!String(over.id).startsWith(COLUMN)) {
      const at = others.findIndex((t) => t.key === over.id)
      if (at >= 0) {
        // Before or after the card it was dropped on, by which half the dragged card's middle is in.
        const dragged = active.rect.current.translated
        const below = dragged ? dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2 : false
        index = at + (below ? 1 : 0)
      }
    }
    const patch = boardMove(ticket, to, column, index)
    if (!patch || !onMove) return
    setMoved({ key: ticket.key, patch })
    onMove(ticket, patch).catch(() => setMoved(null))
  }

  return (
    <>
      <p id="board-hint" className="sr-only">
        To move a task, press Space on it, use the arrow keys, and press Space again. You can also change its status in the task panel.
      </p>
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        accessibility={{ announcements, screenReaderInstructions: { draggable: 'To move a task, press Space, use the arrow keys, and press Space again. Press Escape to cancel.' } }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveKey(null)
          setOverStatus(null)
        }}
      >
        <div aria-describedby="board-hint" className="relative -mx-4 flex snap-x snap-mandatory scroll-px-4 items-start gap-3 overflow-x-auto px-4 pb-4 [scrollbar-width:thin] md:mx-0 md:snap-none md:px-0">
          {columns.map((c) => (
            <BoardColumn key={c.status} {...c} users={users} canMove={canMove} hovered={activeKey != null && overStatus === c.status} />
          ))}
        </div>
        <DragOverlay>
          {active && (
            <div className="rotate-1 cursor-grabbing rounded-lg shadow-xl">
              <TicketRow ticket={active} assignee={nameOf(users, active.assigneeId)} variant="card" />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </>
  )
}
