import { describe, expect, it } from 'vitest'
import { MAX_DISTINCT_REACTIONS, reactorsText, setReaction, toggleReaction } from './reactions'

const names = (id: string) => ({ 'u-1': 'Youssef Abdelrahman', 'u-2': 'Hossam Gaber', 'u-3': 'Nour El-Sayed', 'u-4': 'Mariam Fathy' })[id] ?? 'Unknown person'

describe('toggleReaction', () => {
  it('adds a new emoji, adds me to one already there, and takes mine back', () => {
    const one = toggleReaction([], '👍', 'u-1')!
    expect(one).toEqual([{ emoji: '👍', userIds: ['u-1'] }])
    const two = toggleReaction(one, '👍', 'u-2')!
    expect(two).toEqual([{ emoji: '👍', userIds: ['u-1', 'u-2'] }])
    expect(toggleReaction(two, '👍', 'u-1')).toEqual([{ emoji: '👍', userIds: ['u-2'] }])
    expect(toggleReaction([{ emoji: '👍', userIds: ['u-1'] }], '👍', 'u-1')).toEqual([])
  })
  it('refuses a new emoji past the cap, but not one already there', () => {
    const full = Array.from({ length: MAX_DISTINCT_REACTIONS }, (_, i) => ({ emoji: String.fromCodePoint(0x1f600 + i), userIds: ['u-2'] }))
    expect(toggleReaction(full, '🐍', 'u-1')).toBeNull()
    expect(toggleReaction(full, full[0].emoji, 'u-1')![0].userIds).toEqual(['u-2', 'u-1'])
  })
})

describe('reactorsText (spec 6.6 tooltip)', () => {
  it('puts me first as "You" and joins the rest the way people say it', () => {
    expect(reactorsText(['u-1'], 'u-1', names)).toBe('You')
    expect(reactorsText(['u-2', 'u-1'], 'u-1', names)).toBe('You and Hossam Gaber')
    expect(reactorsText(['u-2', 'u-3', 'u-1'], 'u-1', names)).toBe('You, Hossam Gaber and Nour El-Sayed')
    expect(reactorsText(['u-2', 'u-3', 'u-4', 'u-1'], 'u-1', names)).toBe('You, Hossam Gaber and 2 others')
    expect(reactorsText(['u-2'], 'u-1', names)).toBe('Hossam Gaber')
  })
})

describe('setReaction (spec §8: PUT and DELETE are sets, so a retry changes nothing)', () => {
  it('adds me once, however often it is asked; removing is the same', () => {
    const on = setReaction([], '👍', 'u-1', true)!
    expect(setReaction(on, '👍', 'u-1', true)).toEqual([{ emoji: '👍', userIds: ['u-1'] }])
    const off = setReaction(on, '👍', 'u-1', false)!
    expect(off).toEqual([])
    expect(setReaction(off, '👍', 'u-1', false)).toEqual([])
  })

  it('a new emoji past the limit is refused; removing never is', () => {
    const full = Array.from({ length: MAX_DISTINCT_REACTIONS }, (_, i) => ({ emoji: String.fromCodePoint(0x1f600 + i), userIds: ['u-2'] }))
    expect(setReaction(full, '🐍', 'u-1', true)).toBeNull()
    expect(setReaction(full, '🐍', 'u-1', false)).toEqual(full)
  })
})
