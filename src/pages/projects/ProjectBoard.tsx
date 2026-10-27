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
import { horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import clsx from 'clsx'
import { ArrowLeft, ArrowRight, Inbox, MoreHorizontal, Pencil } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { BoardColumn as Column, StatusCategory, TaskView, TicketPatch, TicketStatus, User } from '@/api/types'
import { MenuPanel } from '@/components/ui/Menu'
import { columnErrors, columnsOf, moveColumn } from '@/lib/boardColumns'
import { DEFAULT_COLUMNS } from '@/lib/statuses'
import { boardMove, prunePending, withPending, type PendingMoves } from '@/pages/projects/boardMove'
import { TicketRow } from '@/pages/projects/TicketRow'
import { tintOf } from '@/pages/projects/ticketPills'

const nameOf = (users: User[], id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? 'Unknown person') : null)
const COLUMN = 'column:'
const HEADER = 'header:'
const menuItem = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm text-fg-secondary hover:bg-surface-muted'
const byRank = (a: TaskView, b: TaskView) => a.rank - b.rank

/** Pulse columns while the tickets load. */
export function BoardSkeleton() {
  return (
    <div className="relative flex gap-3 overflow-hidden" aria-busy="true">
      {DEFAULT_COLUMNS.map(({ id }) => (
        <div key={id} className="h-96 w-[85%] shrink-0 animate-pulse rounded-xl bg-surface-muted md:w-[296px]" />
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
    if (isDragging) {
      dragged.current = true
      return
    }
    // The click a drag ends with comes right after it (and often lands elsewhere): forget the drag once it has passed.
    if (!dragged.current) return
    const t = setTimeout(() => (dragged.current = false))
    return () => clearTimeout(t)
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

/** The ⋯ on a column header, for the project's manager: rename, and move a place towards either side. */
function ColumnMenu({ label, first, last, onRename, onMove }: { label: string; first: boolean; last: boolean; onRename: () => void; onMove: (side: 'left' | 'right') => void }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  // In right-to-left the board reads the other way: "left" is a later place.
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl'
  const canLeft = rtl ? !last : !first
  const canRight = rtl ? !first : !last
  const pick = (run: () => void) => () => {
    setOpen(false)
    run()
  }
  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Column actions: ${label}`}
        title="Column actions"
        className="flex size-7 items-center justify-center rounded-md text-fg-tertiary hover:bg-surface/80 hover:text-fg"
      >
        <MoreHorizontal className="size-4" />
      </button>
      <MenuPanel open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} label="Column actions" className="p-1.5 sm:w-52">
        <button type="button" role="menuitem" className={menuItem} onClick={pick(onRename)}>
          <Pencil className="size-4 shrink-0" /> Rename column
        </button>
        {canLeft && (
          <button type="button" role="menuitem" className={menuItem} onClick={pick(() => onMove('left'))}>
            <ArrowLeft className="size-4 shrink-0" /> Move left
          </button>
        )}
        {canRight && (
          <button type="button" role="menuitem" className={menuItem} onClick={pick(() => onMove('right'))}>
            <ArrowRight className="size-4 shrink-0" /> Move right
          </button>
        )}
      </MenuPanel>
    </div>
  )
}

/** A column: its header (for the manager: sortable sideways, renamable), and its cards as one sortable list that also takes drops when empty. */
function BoardColumn({
  status,
  label,
  category,
  items,
  users,
  canMove,
  hovered,
  editable,
  first,
  last,
  onRename,
  onMoveSide,
}: {
  status: TicketStatus
  label: string
  category: StatusCategory
  items: TaskView[]
  users: User[]
  canMove: (t: TaskView) => boolean
  hovered: boolean
  editable: boolean
  first: boolean
  last: boolean
  onRename: (label: string) => Promise<string | null>
  onMoveSide: (side: 'left' | 'right') => void
}) {
  const { setNodeRef } = useDroppable({ id: COLUMN + status })
  const sortable = useSortable({ id: HEADER + status, disabled: !editable })
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(label)
  const [error, setError] = useState<string | null>(null)
  const hours = Math.round(items.reduce((sum, t) => sum + t.loggedHours, 0) * 10) / 10
  const tint = tintOf(status, category)
  const startRename = () => {
    setDraft(label)
    setError(null)
    setRenaming(true)
  }
  const finish = async () => {
    if (draft.trim() === label) return setRenaming(false)
    const problem = await onRename(draft)
    if (problem) setError(problem)
    else setRenaming(false)
  }
  return (
    <section
      ref={sortable.setNodeRef}
      style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }}
      aria-label={`${label}: ${items.length} tasks`}
      className={clsx(
        'relative flex w-[85%] shrink-0 snap-start flex-col overflow-hidden rounded-xl border md:max-h-[calc(100dvh-14rem)] md:w-[296px]',
        tint.border,
        tint.body,
        hovered && 'ring-2 ring-accent/40',
        sortable.isDragging && 'opacity-40',
      )}
    >
      <header
        ref={sortable.setActivatorNodeRef}
        className={clsx('border-b px-3.5 py-3', tint.head, tint.border, editable && !renaming && 'cursor-grab')}
        {...(editable && !renaming ? { ...sortable.attributes, ...sortable.listeners, 'aria-roledescription': 'movable column', 'aria-label': `Column ${label}` } : {})}
      >
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-fg">
          <span className={clsx('size-2 shrink-0 rounded-full', tint.dot)} aria-hidden />
          {renaming ? (
            <input
              autoFocus
              aria-label="Column name"
              value={draft}
              maxLength={40}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') void finish()
                if (e.key === 'Escape') setRenaming(false)
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onBlur={() => void finish()}
              className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-0.5 text-sm font-semibold text-fg focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-accent-soft"
            />
          ) : (
            <span className="truncate" onDoubleClick={editable ? startRename : undefined}>
              {label}
            </span>
          )}
          <span className="ms-auto rounded-full bg-surface/80 px-2 py-px text-xs font-medium tabular-nums text-fg-tertiary">{items.length}</span>
          {editable && !renaming && <ColumnMenu label={label} first={first} last={last} onRename={startRename} onMove={onMoveSide} />}
        </h2>
        <p className="mt-1 ps-4 text-xs tabular-nums text-fg-muted">
          <span className="font-medium text-fg-secondary">{hours}h</span> logged
        </p>
        {error && (
          <p role="alert" className="mt-1 ps-4 text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
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
 * the drop shows at once and goes back if saving fails. The project's manager also renames columns and puts them in
 * another order (drag a header, or its ⋯ menu).
 */
export function ProjectBoard({
  tickets,
  users,
  canMove = () => false,
  onMove,
  error,
  board,
  onBoard,
}: {
  tickets: TaskView[]
  users: User[]
  canMove?: (ticket: TaskView) => boolean
  onMove?: (ticket: TaskView, patch: TicketPatch) => Promise<unknown>
  error?: string | null
  /** The project's columns (names and order); missing is the standard board. */
  board?: Column[]
  /** Saves the columns; given only to whoever may change them. */
  onBoard?: (columns: Column[]) => Promise<unknown>
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // A press and hold lifts a card on touch screens, so a swipe still scrolls the columns.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [overStatus, setOverStatus] = useState<TicketStatus | null>(null)
  // Drops show at once, each until the server's copy of its task changes (the save landed, or someone else moved it),
  // or its save fails.
  const [pending, setPending] = useState<PendingMoves>({})
  const live = useMemo(() => prunePending(pending, tickets), [pending, tickets])
  useEffect(() => {
    if (Object.keys(live).length !== Object.keys(pending).length) setPending(live)
  }, [live, pending])
  const shown = useMemo(() => withPending(tickets, live), [live, tickets])
  // A column change shows at once too, until the saved board matches it or the save fails.
  const savedBoard = useMemo(() => columnsOf({ board }), [board])
  const [boardDraft, setBoardDraft] = useState<Column[] | null>(null)
  const boardSaved = boardDraft != null && JSON.stringify(boardDraft) === JSON.stringify(savedBoard)
  useEffect(() => {
    if (boardSaved) setBoardDraft(null)
  }, [boardSaved])
  const order = boardDraft ?? savedBoard
  const editable = Boolean(onBoard)
  const columns = order.map(({ id, label, category }) => ({ status: id, label, category, items: shown.filter((t) => t.status === id).sort(byRank) }))
  const find = (key: string) => shown.find((t) => t.key === key)
  const columnOf = (id: string) =>
    id.startsWith(COLUMN) ? (id.slice(COLUMN.length) as TicketStatus) : id.startsWith(HEADER) ? (id.slice(HEADER.length) as TicketStatus) : find(id)?.status
  const labelOf = (status: TicketStatus | undefined) => order.find((c) => c.id === status)?.label ?? ''
  const active = activeKey && !activeKey.startsWith(HEADER) ? find(activeKey) : undefined
  const activeColumn = activeKey?.startsWith(HEADER) ? columns.find((c) => HEADER + c.status === activeKey) : undefined

  /** Saves a new board; the sentence that says why it can't be, or null once it is sent. */
  const saveBoard = async (next: Column[]): Promise<string | null> => {
    const problem = columnErrors(next)
    if (problem || !onBoard) return problem
    setBoardDraft(next)
    try {
      await onBoard(next)
      return null
    } catch (e) {
      setBoardDraft(null)
      return (e as Error).message
    }
  }
  const rename = (status: TicketStatus) => (label: string) => saveBoard(order.map((c) => (c.id === status ? { ...c, label: label.trim() } : c)))
  const moveSide = (status: TicketStatus) => (side: 'left' | 'right') => {
    const rtl = document.documentElement.dir === 'rtl'
    const at = order.findIndex((c) => c.id === status)
    void saveBoard(moveColumn(order, status, at + ((side === 'right') !== rtl ? 1 : -1)))
  }

  const named = (id: string | number) => (String(id).startsWith(HEADER) ? `column ${labelOf(columnOf(String(id)))}` : String(id))
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${named(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${named(active.id)} is over ${labelOf(columnOf(String(over.id)))}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `Dropped ${named(active.id)} at ${labelOf(columnOf(String(over.id)))}.` : `Cancelled moving ${named(active.id)}.`),
    onDragCancel: ({ active }) => `Cancelled moving ${named(active.id)}.`,
  }

  const onDragStart = ({ active }: DragStartEvent) => setActiveKey(String(active.id))
  const onDragOver = ({ active, over }: DragOverEvent) =>
    setOverStatus(over && !String(active.id).startsWith(HEADER) ? (columnOf(String(over.id)) ?? null) : null)
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveKey(null)
    setOverStatus(null)
    if (String(active.id).startsWith(HEADER)) {
      // A header dropped over another column takes that column's place.
      const from = columnOf(String(active.id))
      const to = over ? columnOf(String(over.id)) : undefined
      if (from && to && from !== to) void saveBoard(moveColumn(order, from, order.findIndex((c) => c.id === to)))
      return
    }
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
    const base = tickets.find((t) => t.key === ticket.key)!
    setPending((p) => ({ ...p, [ticket.key]: { patch, updatedAt: base.updatedAt } }))
    onMove(ticket, patch).catch(() =>
      setPending((p) => {
        const { [ticket.key]: _failed, ...rest } = p
        return rest
      }),
    )
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
          <SortableContext id="columns" items={columns.map((c) => HEADER + c.status)} strategy={horizontalListSortingStrategy}>
            {columns.map((c, i) => (
              <BoardColumn
                key={c.status}
                {...c}
                users={users}
                canMove={canMove}
                hovered={activeKey != null && overStatus === c.status}
                editable={editable}
                first={i === 0}
                last={i === columns.length - 1}
                onRename={rename(c.status)}
                onMoveSide={moveSide(c.status)}
              />
            ))}
          </SortableContext>
        </div>
        <DragOverlay>
          {active && (
            <div className="rotate-1 cursor-grabbing rounded-lg shadow-xl">
              <TicketRow ticket={active} assignee={nameOf(users, active.assigneeId)} variant="card" />
            </div>
          )}
          {activeColumn && (
            <div className={clsx('w-[296px] cursor-grabbing rounded-xl border px-3.5 py-3 text-sm font-semibold text-fg shadow-xl', tintOf(activeColumn.status, activeColumn.category).head, tintOf(activeColumn.status, activeColumn.category).border)}>
              {activeColumn.label} · <span className="tabular-nums">{activeColumn.items.length}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </>
  )
}
