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

  it('a channel just opened is marked once its first message loads, only in a visible tab', () => {
    expect(shouldMarkRead(null, 'm1', true)).toBe(true)
    expect(shouldMarkRead(null, 'm1', false)).toBe(false)
    expect(shouldMarkRead(null, null, true)).toBe(false)
  })
  it('a channel opened on cached messages waits for the refetch before marking read', () => {
    expect(shouldMarkRead(null, 'm1', true, false)).toBe(false)
    expect(shouldMarkRead(null, 'm1', true, true)).toBe(true)
  })
})

