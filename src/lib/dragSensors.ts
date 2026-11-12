import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type KeyboardCoordinateGetter, type KeyboardSensorOptions } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

/** Space picks up and drops, Esc puts back: Enter stays the link's, to open (the sidebar and the board). */
export const SPACE_DRAG_KEYS: KeyboardSensorOptions['keyboardCodes'] = { start: ['Space'], cancel: ['Escape'], end: ['Space'] }

/**
 * ↑ and ↓ take what's being dragged to the drop zone above or below the one it's over, a whole zone at a time (the
 * Sprints view's sections), where the sortable getter steps from item to item. Places it at the zone's top corner.
 */
export const zoneKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context: { active, collisionRect, droppableRects, droppableContainers, over } }) => {
  if (event.code !== 'ArrowUp' && event.code !== 'ArrowDown') return undefined
  event.preventDefault()
  if (!active || !collisionRect) return undefined
  const zones = droppableContainers
    .getEnabled()
    .flatMap((zone) => {
      const rect = droppableRects.get(zone.id)
      return rect ? [{ id: zone.id, rect }] : []
    })
    .sort((a, b) => a.rect.top - b.rect.top)
  // The zone it's over; before the first collision, the last one starting above it (they're in order).
  const at = over ? zones.findIndex((zone) => zone.id === over.id) : zones.filter((zone) => zone.rect.top <= collisionRect.top).length - 1
  const next = at < 0 ? undefined : zones[at + (event.code === 'ArrowUp' ? -1 : 1)]
  return next ? { x: next.rect.left, y: next.rect.top } : undefined
}

/**
 * How things are picked up for dragging, shared by the board, the sidebar and the Sprints view: the mouse after 5px (a
 * click stays a click), touch after a 250ms press and hold (a swipe still scrolls), and the keyboard. `keys` changes
 * the keyboard's keys where Enter already means something (a link); `coordinates` where the arrows go (item to item by
 * default). Mouse and touch have a sensor each: one for all pointers would take a finger after 5px too, before the
 * hold could count (slice Y review). A zone at a time, the page scrolls to the next zone at once, not smoothly: a
 * smooth scroll is still on its way when a Space right after drops, and the row would land where it was (Ruling 12).
 */
export function useDragSensors(keys?: KeyboardSensorOptions['keyboardCodes'], coordinates: KeyboardCoordinateGetter = sortableKeyboardCoordinates) {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: coordinates, ...(keys && { keyboardCodes: keys }), ...(coordinates === zoneKeyboardCoordinates && { scrollBehavior: 'auto' as const }) }),
  )
}
