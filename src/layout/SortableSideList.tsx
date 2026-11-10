import { closestCenter, DndContext, type Announcements, type CollisionDetection, type DragEndEvent, type DragStartEvent, type UniqueIdentifier } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import clsx from 'clsx'
import { useRef, type ReactNode } from 'react'
import { SPACE_DRAG_KEYS, useDragSensors } from '@/lib/dragSensors'
import { moveInOrder } from '@/lib/sidebarOrder'

export type SortableSideItem = { id: string; label: string; muted: boolean }

/**
 * A sidebar section's rows that people reorder by dragging (spec 5.1): the mouse after 5px, touch after a press and
 * hold, or the keyboard (Space picks up, ↑/↓ move, Space drops, Esc cancels; Enter still opens the row). A muted row
 * stays among the muted (spec 6.11). `onReorder` gets every id in the new order; `children` renders a row and gives it
 * the instructions' id for its `aria-describedby`.
 */
export function SortableSideList({
  label,
  items,
  onReorder,
  children,
}: {
  /** The section's name, for what a screen reader hears. */
  label: string
  items: SortableSideItem[]
  onReorder: (ids: string[]) => void
  children: (item: SortableSideItem, describedBy: string | undefined) => ReactNode
}) {
  // Space alone starts and ends a drag: Enter on a row is the link's.
  const sensors = useDragSensors(SPACE_DRAG_KEYS)
  const ids = items.map((i) => i.id)
  const nameOf = (id: UniqueIdentifier) => items.find((i) => i.id === id)?.label ?? String(id)
  const place = (id: UniqueIdentifier) => `position ${ids.indexOf(String(id)) + 1} of ${ids.length} in ${label}`
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}, ${place(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${nameOf(active.id)} is at ${place(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `Dropped ${nameOf(active.id)} at ${place(over.id)}.` : `Put ${nameOf(active.id)} back.`),
    onDragCancel: ({ active }) => `Put ${nameOf(active.id)} back.`,
  }
  const muted = new Set(items.filter((i) => i.muted).map((i) => i.id))
  // Only rows on the dragged row's side of the muted line are places to drop it: the preview and what a screen reader
  // hears never offer the other side.
  const sameSide: CollisionDetection = (args) =>
    closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => muted.has(String(c.id)) === muted.has(String(args.active.id))) })

  // A mouse or finger drag ends with a click on the row under it. dnd-kit stops that click on its way to React, but not
  // the link's own navigation (a full page load): from the start of such a drag until just after it ends, a click on a
  // row is cancelled here, on the window, before dnd-kit sees it. Keyboard drags leave clicks alone.
  const cancelClicks = useRef<(() => void) | null>(null)
  const onDragStart = ({ activatorEvent }: DragStartEvent) => {
    if (activatorEvent instanceof KeyboardEvent) return
    const cancel = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-side-sortable]')) event.preventDefault()
    }
    window.addEventListener('click', cancel, true)
    cancelClicks.current = () => setTimeout(() => window.removeEventListener('click', cancel, true))
  }
  const stopCancelling = () => {
    cancelClicks.current?.()
    cancelClicks.current = null
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    stopCancelling()
    const next = moveInOrder(ids, String(active.id), over ? String(over.id) : null, muted)
    if (next) onReorder(next)
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={sameSide}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={stopCancelling}
      accessibility={{ announcements, screenReaderInstructions: { draggable: 'To move it in the list, press Space, then the up and down arrows, and Space again. Escape puts it back.' } }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <SortableRow key={item.id} id={item.id}>
            {(describedBy) => children(item, describedBy)}
          </SortableRow>
        ))}
      </SortableContext>
    </DndContext>
  )
}

function SortableRow({ id, children }: { id: string; children: (describedBy: string | undefined) => ReactNode }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id })
  return (
    // The row's link keeps the focus and its name; the list item only listens, so there is no second tab stop.
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-side-sortable=""
      className={clsx('relative flex-none touch-manipulation', isDragging && 'z-10 rounded-sf-md bg-sf-sidebar-hover shadow-sf-menu')}
      {...listeners}
      // A link is the browser's to drag (its address) unless told otherwise: that would cancel ours mid-gesture.
      onDragStart={(e) => e.preventDefault()}
    >
      {children(attributes['aria-describedby'])}
    </li>
  )
}
