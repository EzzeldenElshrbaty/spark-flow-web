import { describe, expect, it } from 'vitest'
import type { ArchivedRecord } from '@/api/types'
import { deletableText, filterArchived, goesWith } from './archivedView'

const none = { tasks: 0, files: 0, comments: 0, phases: 0, deliverables: 0 }
const row = (over: Partial<ArchivedRecord>): ArchivedRecord => ({
  type: 'task', id: 'NEX-9', name: 'Spike', ref: 'NEX-9', projectId: 'p-nex', archivedAt: '2026-10-31T12:00:00.000Z', archivedBy: 'u-1', reason: null,
  deletableFrom: '2027-10-31T12:00:00.000Z', keptBecause: null, includes: none, restoreBlocked: null, ...over,
})
const now = new Date('2026-11-01T12:00:00Z')

describe('reading archived records (slice 4)', () => {
  it('says whether and when a record can be deleted for good', () => {
    expect(deletableText(row({}), now)).toEqual({ text: 'From 31 Oct 2027', now: false })
    expect(deletableText(row({ deletableFrom: '2026-10-01T00:00:00.000Z' }), now)).toEqual({ text: 'Now', now: true })
    expect(deletableText(row({ keptBecause: 'time', deletableFrom: null }), now)).toEqual({ text: 'Always kept · time logged', now: false })
    expect(deletableText(row({ type: 'channel', keptBecause: 'channel', deletableFrom: null }), now)).toEqual({ text: 'Restore only', now: false })
  })

  it('names what goes with it', () => {
    expect(goesWith(row({}))).toBeNull()
    expect(goesWith(row({ includes: { ...none, comments: 1 } }))).toBe('its 1 comment')
    expect(goesWith(row({ includes: { tasks: 12, files: 3, comments: 0, phases: 5, deliverables: 1 } }))).toBe('its 12 tasks, 3 files, 5 phases and 1 deliverable')
  })

  it('searches names, keys and reasons, and narrows to a type', () => {
    const items = [row({ name: 'Spike', reason: 'Client paused' }), row({ type: 'project', id: 'p-sel', name: 'Sela booking', ref: 'SEL' })]
    expect(filterArchived(items, 'paused', '').map((r) => r.name)).toEqual(['Spike'])
    expect(filterArchived(items, 'sel', '').map((r) => r.name)).toEqual(['Sela booking'])
    expect(filterArchived(items, '', 'project').map((r) => r.name)).toEqual(['Sela booking'])
  })
})
