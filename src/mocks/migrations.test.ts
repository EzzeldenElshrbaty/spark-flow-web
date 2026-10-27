import { describe, expect, it } from 'vitest'
import { migrate } from './migrations'

describe('migrations', () => {
  it('3 → 4 gives every person the default person\'s read map', () => {
    const v3 = { version: 3, currentUserId: 'u1', users: [{ id: 'u1' }, { id: 'u2' }], reads: { c1: 'T1', c2: 'T2' } }
    const next = migrate(v3, 4)!
    expect(next.reads).toEqual({ u1: { c1: 'T1', c2: 'T2' }, u2: { c1: 'T1', c2: 'T2' } })
    // Each person owns their copy: one reading on doesn't move another's marker.
    const reads = next.reads as Record<string, Record<string, string>>
    reads.u2!.c1 = 'T9'
    expect(reads.u1!.c1).toBe('T1')
  })
})
