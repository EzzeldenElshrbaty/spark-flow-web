import { describe, expect, it } from 'vitest'
import type { TimeEntry } from '@/api/types'
import { canChangeEntry } from './EntryActions'

const entry = (over: Partial<TimeEntry>): TimeEntry => ({ id: 'te-1', userId: 'u-3', projectId: 'p-nex', taskId: null, startedAt: '2026-11-05T08:00:00.000Z', endedAt: '2026-11-05T09:00:00.000Z', source: 'manual', note: '', endReason: null, ...over })

describe('canChangeEntry', () => {
  it('mine, one I added for someone (add time for), or anyone’s with editOthers; never while running', () => {
    expect(canChangeEntry(entry({}), 'u-3', false)).toBe(true)
    expect(canChangeEntry(entry({ addedBy: 'u-2' }), 'u-2', false)).toBe(true)
    expect(canChangeEntry(entry({ addedBy: 'u-2' }), 'u-4', false)).toBe(false)
    expect(canChangeEntry(entry({}), 'u-1', true)).toBe(true)
    expect(canChangeEntry(entry({ endedAt: null, addedBy: 'u-2' }), 'u-2', false)).toBe(false)
  })
})
