import { describe, expect, it } from 'vitest'
import { manualEntryErrors, toManualEntry, type ManualEntryValues } from './manualEntry'

const now = new Date(2026, 9, 28, 18, 0)
const v = (over: Partial<ManualEntryValues> = {}): ManualEntryValues => ({ day: '2026-10-28', start: '09:00', end: '10:30', note: '', taskId: 't-nex-101', projectId: 'p-nex', ...over })

describe('manualEntryErrors', () => {
  it('uses the same sentences as the server', () => {
    expect(manualEntryErrors(v({ start: '09:00', end: '08:00' }), now)).toEqual({ end: 'The end is before the start.' })
    expect(manualEntryErrors(v({ start: '17:00', end: '19:00' }), now)).toEqual({ end: "Time can't be logged in the future." })
    expect(manualEntryErrors(v({ start: '05:00', end: '17:30' }), now)).toEqual({ end: 'One entry can be up to 12 hours.' })
    expect(manualEntryErrors(v({ note: 'x'.repeat(201) }), now)).toEqual({ note: 'Keep the note under 200 characters.' })
    expect(manualEntryErrors(v({ projectId: '', taskId: null }), now)).toEqual({ task: 'Pick a project.' })
  })
  it('accepts a valid entry, with or without a task', () => {
    expect(manualEntryErrors(v(), now)).toEqual({})
    expect(manualEntryErrors(v({ taskId: null }), now)).toEqual({})
  })
})

describe('toManualEntry', () => {
  it('turns the local day and times into ISO; a task wins over its project', () => {
    expect(toManualEntry(v())).toEqual({ taskId: 't-nex-101', startedAt: new Date(2026, 9, 28, 9, 0).toISOString(), endedAt: new Date(2026, 9, 28, 10, 30).toISOString(), note: '' })
    expect(toManualEntry(v({ taskId: null, note: ' Review ' }))).toMatchObject({ projectId: 'p-nex', note: 'Review' })
  })
})
