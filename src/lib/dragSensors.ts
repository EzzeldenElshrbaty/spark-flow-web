import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type KeyboardSensorOptions } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

/** Space picks up and drops, Esc puts back: Enter stays the link's, to open (the sidebar and the board). */
export const SPACE_DRAG_KEYS: KeyboardSensorOptions['keyboardCodes'] = { start: ['Space'], cancel: ['Escape'], end: ['Space'] }

/**
 * How things are picked up for dragging, shared by the board and the sidebar: the mouse after 5px (a click stays a
 * click), touch after a 250ms press and hold (a swipe still scrolls), and the keyboard. `keys` changes the keyboard's
 * keys where Enter already means something (a link). Mouse and touch have a sensor each: one for all pointers would
 * take a finger after 5px too, before the hold could count (slice Y review).
 */
export function useDragSensors(keys?: KeyboardSensorOptions['keyboardCodes']) {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, ...(keys && { keyboardCodes: keys }) }),
  )
}
