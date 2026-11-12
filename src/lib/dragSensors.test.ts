// @vitest-environment jsdom
import { KeyboardSensor, type KeyboardSensorOptions } from '@dnd-kit/core'
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SPACE_DRAG_KEYS, useDragSensors, zoneKeyboardCoordinates } from './dragSensors'

/** The keyboard sensor's options, as `useDragSensors` sets them. */
const keyboard = (...args: Parameters<typeof useDragSensors>) =>
  renderHook(() => useDragSensors(...args)).result.current.find((s) => s.sensor === KeyboardSensor)?.options as KeyboardSensorOptions

describe('useDragSensors', () => {
  // Sprints final review (Ruling 12): ↑ or ↓ down the page scrolls to the next section; a smooth scroll is still on its
  // way when a Space right after drops, so the row would land where it was.
  it('a zone at a time (the Sprints view), ↑ and ↓ scroll at once', () => {
    expect(keyboard(SPACE_DRAG_KEYS, zoneKeyboardCoordinates)).toMatchObject({ coordinateGetter: zoneKeyboardCoordinates, keyboardCodes: SPACE_DRAG_KEYS, scrollBehavior: 'auto' })
  })

  it('item to item (the board, the sidebar), the keyboard scrolls as dnd-kit does', () => {
    expect(keyboard(SPACE_DRAG_KEYS).scrollBehavior).toBeUndefined()
  })
})
