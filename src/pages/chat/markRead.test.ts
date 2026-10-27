import { describe, expect, it } from 'vitest'
import { readUpTo, shouldMarkRead } from './markRead'

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


describe('readUpTo (spec 6.2: the newest message is on screen and the window is focused)', () => {
  const at = { atBottom: true, visible: true, focused: true, settled: true, newestSeq: 9, markedSeq: 7 }
  it('reads up to the newest message when all of that holds', () => {
    expect(readUpTo(at)).toBe(9)
  })
  it('waits while scrolled up, in a hidden tab, an unfocused window, or while fetching', () => {
    expect(readUpTo({ ...at, atBottom: false })).toBeNull()
    expect(readUpTo({ ...at, visible: false })).toBeNull()
    expect(readUpTo({ ...at, focused: false })).toBeNull()
    expect(readUpTo({ ...at, settled: false })).toBeNull()
  })
  it('does nothing when that much is already read, or the channel is empty', () => {
    expect(readUpTo({ ...at, markedSeq: 9 })).toBeNull()
    expect(readUpTo({ ...at, newestSeq: null })).toBeNull()
  })
})
