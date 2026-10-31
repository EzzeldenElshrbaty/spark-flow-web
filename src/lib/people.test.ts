import { describe, expect, it } from 'vitest'
import { isActive, pickable } from './people'

const at = { at: '2026-10-31T10:00:00.000Z', by: 'u-1', reason: null }
const people = [{ id: 'a' }, { id: 'b', deactivated: at }, { id: 'c', deactivated: null }]

describe('who a picker offers (slice 3)', () => {
  it('everyone active, and whoever is already chosen even if deactivated since', () => {
    expect(isActive(people[0]!)).toBe(true)
    expect(isActive(people[1]!)).toBe(false)
    expect(pickable(people).map((p) => p.id)).toEqual(['a', 'c'])
    expect(pickable(people, ['b', null]).map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })
})
