import {
  closestCorners,
  DndContext,
  DragOverlay,
  useDroppable,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { horizontalListSortingStrategy, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import clsx from 'clsx'
import { ArrowLeft, ArrowRight, Inbox, MoreHorizontal, Pencil, Plus, Shapes, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ColumnStripBar, useColumnStrip } from './ColumnStrip'
import type { BoardColumn as Column, StatusCategory, TaskView, TicketPatch, TicketStatus, User } from '@/api/types'
import { MenuPanel } from '@/components/ui/Menu'
import { canDeleteColumn, columnErrors, columnsOf, MAX_COLUMNS, MAX_LABEL, moveColumn } from '@/lib/boardColumns'
import { ColumnSheet } from '@/pages/projects/ColumnSheet'
import { DeleteColumnSheet } from '@/pages/projects/DeleteColumnSheet'
import { DEFAULT_COLUMNS } from '@/lib/statuses'
import { useDragSensors } from '@/lib/dragSensors'
import { boardDrop, prunePending, withPending, type PendingMoves } from '@/pages/projects/boardMove'
import { TicketRow } from '@/pages/projects/TicketRow'
import { tintOf } from '@/pages/projects/ticketPills'
import { IconButton } from '@/components/ui/IconButton'

const nameOf = (users: User[], id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? 'Unknown person') : null)
const COLUMN = 'column:'
const HEADER = 'header:'
const menuItem = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm text-fg-secondary hover:bg-surface-muted'
const byRank = (a: TaskView, b: TaskView) => a.rank - b.rank

/** Pulse columns while the tickets load, each with a header and two cards (UX Phase 4, 4.5: shaped like the board). */
export function BoardSkeleton() {
  return (
    <div className="relative flex gap-3 overflow-hidden" aria-busy="true">
      {DEFAULT_COLUMNS.map(({ id }) => (
        <div key={id} data-pulse="column" className="w-[85%] shrink-0 animate-pulse rounded-xl border border-line bg-surface-muted p-3 md:w-[296px]">
          <div className="h-4 w-24 rounded bg-surface-strong" />
          {[0, 1].map((card) => (
            <div key={card} data-pulse="card" className="mt-3 h-20 rounded-lg bg-surface" />
          ))}
        </div>
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
      <TicketRow ticket={ticket} assignee={assignee} variant="card" tabIndex={movable ? -1 : undefined} />
    </li>
  )
}

/** The ⋯ on a column header, for the project's manager: rename, change type, move a place either way, delete. */
function ColumnMenu({
  label,
  first,
  last,
  canDelete,
  onRename,
  onMove,
  onChangeType,
  onDelete,
}: {
  label: string
  first: boolean
  last: boolean
  canDelete: boolean
  onRename: () => void
  onMove: (side: 'left' | 'right') => void
  onChangeType: () => void
  onDelete: () => void
}) {
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
      <IconButton
        ref={triggerRef}
        label={`Column actions: ${label}`}
        title="Column actions"
        icon={MoreHorizontal}
        size="sm"
        onClick={() => setOpen((v) => !v)}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        aria-haspopup="menu"
        aria-expanded={open}
      />
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
        <button type="button" role="menuitem" className={menuItem} onClick={pick(onChangeType)}>
          <Shapes className="size-4 shrink-0" /> Change type
        </button>
        <button
          type="button"
          role="menuitem"
          disabled={!canDelete}
          title={canDelete ? undefined : 'Each type needs at least one column.'}
          className={clsx(menuItem, 'text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400')}
          onClick={pick(onDelete)}
        >
          <Trash2 className="size-4 shrink-0" />
          <span className="min-w-0">
            Delete column
            {!canDelete && <span className="block text-xs text-fg-muted">Each type needs at least one column.</span>}
          </span>
        </button>
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
  canDelete,
  onChangeType,
  onDelete,
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
  canDelete: boolean
  onChangeType: () => void
  onDelete: () => void
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
    if (draft.trim() === label) {
      setError(null)
      return setRenaming(false)
    }
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
              maxLength={MAX_LABEL}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') void finish()
                if (e.key === 'Escape') {
                  setError(null)
                  setRenaming(false)
                }
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
          {editable && !renaming && (
            <ColumnMenu label={label} first={first} last={last} canDelete={canDelete} onRename={startRename} onMove={onMoveSide} onChangeType={onChangeType} onDelete={onDelete} />
          )}
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
  onMoveTo,
  error,
  board,
  onBoard,
  projectId,
  countOf,
  allTickets,
}: {
  tickets: TaskView[]
  /** Every task of the project, when `tickets` is filtered: drops are ranked against these. */
  allTickets?: TaskView[]
  users: User[]
  canMove?: (ticket: TaskView) => boolean
  onMove?: (ticket: TaskView, patch: TicketPatch) => Promise<unknown>
  /** A drop that needs its column renumbered: placed by the server in one write. */
  onMoveTo?: (ticket: TaskView, status: string, index: number, visibleKeys: string[]) => Promise<unknown>
  error?: string | null
  /** The project's columns (names and order); missing is the standard board. */
  board?: Column[]
  /** Saves the columns; given only to whoever may change them. */
  onBoard?: (columns: Column[]) => Promise<unknown>
  /** For adding and deleting columns (with onBoard). */
  projectId?: string
  /** How many tasks a column holds in all (filters and archived included), for the delete sheet. */
  countOf?: (columnId: string) => number
}) {
  // A press and hold lifts a card on touch screens, so a swipe still scrolls the columns.
  const sensors = useDragSensors()
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
  const [boardError, setBoardError] = useState<string | null>(null)
  // The draft holds until the server sends any newer board (this save, or another tab's change), then the server wins.
  const draftBase = useRef(board)
  useEffect(() => {
    if (board !== draftBase.current) {
      draftBase.current = board
      setBoardDraft(null)
    }
  }, [board])
  const order = boardDraft ?? savedBoard
  const editable = Boolean(onBoard)
  const [adding, setAdding] = useState(false)
  const [typing, setTyping] = useState<Column | null>(null)
  const [deleting, setDeleting] = useState<Column | null>(null)
  const columns = order.map(({ id, label, category }) => ({ status: id, label, category, items: shown.filter((t) => t.status === id).sort(byRank) }))
  // Which columns are in view, and arrows to the others (UX Phase 4, 4.1).
  const stripRef = useRef<HTMLDivElement>(null)
  const strip = useColumnStrip(stripRef, columns.length)
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
    setBoardError(null)
    try {
      await onBoard(next)
      return null
    } catch (e) {
      setBoardDraft(null)
      return (e as Error).message
    }
  }
  /** A column change from the menu or a header drag: its failure shows above the board. */
  const saveAndSay = (next: Column[]) => void saveBoard(next).then((problem) => problem && setBoardError(problem))
  const rename = (status: TicketStatus) => (label: string) => saveBoard(order.map((c) => (c.id === status ? { ...c, label: label.trim() } : c)))
  const moveSide = (status: TicketStatus) => (side: 'left' | 'right') => {
    const rtl = document.documentElement.dir === 'rtl'
    const at = order.findIndex((c) => c.id === status)
    saveAndSay(moveColumn(order, status, at + ((side === 'right') !== rtl ? 1 : -1)))
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
      if (from && to && from !== to) saveAndSay(moveColumn(order, from, order.findIndex((c) => c.id === to)))
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
    // Ranked against the whole column (allTickets), so a card hidden by a filter never ties with the drop.
    // With the drops still saving applied, like the cards on screen.
    const full = withPending(allTickets ?? tickets, pending).filter((t) => t.status === to).sort((a, b) => a.rank - b.rank)
    const drop = boardDrop(ticket, to, column, full, index)
    if (!drop || !onMove) return
    const { patch } = drop
    // Ranks too close to split: one move on the server places it and renumbers the column (a member can't patch others' cards).
    const base = tickets.find((t) => t.key === ticket.key)!
    if (drop.renumber.length > 0 && onMoveTo) {
      // Held where it was dropped until the server's renumber lands, so it doesn't snap back.
      const shownPatch: TicketPatch = ticket.status === to ? { rank: drop.pendingRank } : { status: to, rank: drop.pendingRank }
      setPending((p) => ({ ...p, [ticket.key]: { patch: shownPatch, updatedAt: base.updatedAt } }))
      onMoveTo(ticket, to, index, column.filter((t) => t.key !== ticket.key).map((t) => t.key)).catch(() =>
        setPending((p) => {
          const { [ticket.key]: _failed, ...rest } = p
          return rest
        }),
      )
      return
    }
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
      {(error || boardError) && (
        <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
          {error || boardError}
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
        <ColumnStripBar strip={strip} />
        <div className="relative">
          <div ref={stripRef} aria-describedby="board-hint" className="relative -mx-4 flex snap-x snap-mandatory scroll-px-4 items-start gap-3 overflow-x-auto px-4 pb-4 [scrollbar-width:thin] md:mx-0 md:snap-none md:px-0">
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
                  canDelete={canDeleteColumn(order, c.status)}
                  onChangeType={() => setTyping(order.find((o) => o.id === c.status) ?? null)}
                  onDelete={() => setDeleting(order.find((o) => o.id === c.status) ?? null)}
                />
              ))}
            </SortableContext>
            {editable && projectId && order.length < MAX_COLUMNS && (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex h-24 w-[85%] shrink-0 snap-start items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong text-sm font-medium text-fg-secondary hover:bg-surface-muted hover:text-fg md:w-[296px]"
              >
                <Plus className="size-4" /> Add column
              </button>
            )}
          </div>
          {/* More columns past the end: the edge fades (phones show the next column's edge instead). */}
          {strip.overflows && !strip.atEnd && <span aria-hidden className="pointer-events-none absolute inset-y-0 end-0 hidden w-10 bg-linear-to-l from-canvas md:block rtl:bg-linear-to-r" />}
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
      {adding && projectId && <ColumnSheet projectId={projectId} columns={order} onClose={() => setAdding(false)} />}
      {typing && projectId && <ColumnSheet projectId={projectId} columns={order} column={typing} onClose={() => setTyping(null)} />}
      {deleting && projectId && (
        <DeleteColumnSheet
          projectId={projectId}
          columns={order}
          column={deleting}
          count={countOf ? countOf(deleting.id) : tickets.filter((t) => t.status === deleting.id).length}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  )
}
