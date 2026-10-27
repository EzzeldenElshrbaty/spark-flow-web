import { describe, expect, it } from 'vitest'
import { shouldMarkRead } from './markRead'

describe('shouldMarkRead', () => {
  it('marks read when a new message arrives in a visible channel, not in a hidden tab, not when nothing changed', () => {
    expect(shouldMarkRead('m1', 'm2', true)).toBe(true)
    expect(shouldMarkRead('m1', 'm2', false)).toBe(false)
    expect(shouldMarkRead('m2', 'm2', true)).toBe(false)
    expect(shouldMarkRead(null, null, true)).toBe(false)
    expect(shouldMarkRead(null, 'm1', true)).toBe(true)
  })
})
