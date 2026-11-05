import { describe, expect, it } from 'vitest'
import type { TimeEntry } from '@/api/types'
import { capped } from '@/lib/hours'
import { defaultTimes, manualEntryErrors, toManualEntry, toPatch, valuesOf, type ManualEntryValues } from './manualEntry'

const now = new Date(2026, 9, 28, 18, 0)
const v = (over: Partial<ManualEntryValues> = {}): ManualEntryValues => ({ day: '2026-10-28', start: '09:00', end: '10:30', note: '', taskId: 't-nex-101', projectId: 'p-nex', ...over })

describe('manualEntryErrors', () => {
  it('uses the same sentences as the server', () => {
    expect(manualEntryErrors(v({ start: '09:00', end: '09:00' }), now)).toEqual({ end: 'The end is before the start.' })
    expect(manualEntryErrors(v({ start: '22:00', end: '01:00' }), now)).toEqual({ end: "An entry can't run past midnight. Add it as two entries." })
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

describe('defaultTimes', () => {
  it('is the hour before now, rounded down to 15 minutes', () => {
    expect(defaultTimes(new Date(2026, 9, 28, 14, 7))).toEqual({ day: '2026-10-28', start: '13:00', end: '14:00' })
  })
  it('just after midnight it is late yesterday instead', () => {
    expect(defaultTimes(new Date(2026, 9, 28, 0, 5))).toEqual({ day: '2026-10-27', start: '22:45', end: '23:45' })
  })
})

describe('editing an entry', () => {
  const entry = (start: Date, end: Date, over: Partial<TimeEntry> = {}): TimeEntry => ({ id: 'te1', userId: 'u-1', projectId: 'p-nex', taskId: 't-nex-101', startedAt: start.toISOString(), endedAt: end.toISOString(), source: 'manual', note: 'pairing', endReason: null, ...over })

  it("valuesOf gives back the entry's day, times and note", () => {
    const start = new Date(2026, 9, 27, 9, 15)
    expect(valuesOf(entry(start, new Date(2026, 9, 27, 10, 45)))).toEqual({ day: '2026-10-27', start: '09:15', end: '10:45', note: 'pairing', taskId: 't-nex-101', projectId: 'p-nex' })
  })

  it('toPatch sends the times, the note and the target', () => {
    const v = { day: '2026-10-27', start: '09:15', end: '10:45', note: ' x ', taskId: null, projectId: 'p-nex' }
    expect(toPatch(v)).toEqual({ startedAt: new Date(2026, 9, 27, 9, 15).toISOString(), endedAt: new Date(2026, 9, 27, 10, 45).toISOString(), note: 'x', target: { projectId: 'p-nex' } })
  })

  it('capped is true only for a timer entry stopped at 12 h', () => {
    const start = new Date(2026, 9, 26, 9)
    expect(capped(entry(start, new Date(2026, 9, 26, 21), { source: 'timer' }))).toBe(true)
    expect(capped(entry(start, new Date(2026, 9, 26, 21)))).toBe(false) // a manual 12 h entry was typed on purpose
    expect(capped(entry(start, new Date(2026, 9, 26, 20), { source: 'timer' }))).toBe(false)
    expect(capped(entry(start, start, { source: 'timer', endedAt: null }))).toBe(false)
  })
})

describe('editing keeps what was not changed', () => {
  it('toPatch leaves out times whose day and HH:mm did not change, so their seconds stay', () => {
    const original = { day: '2026-10-27', start: '10:30', end: '11:00', note: '', taskId: 't-nex-101', projectId: 'p-nex' }
    const patch = toPatch({ ...original, note: 'just a note' }, original)
    expect(patch).toEqual({ note: 'just a note', target: { taskId: 't-nex-101' } })
    expect(toPatch({ ...original, end: '11:15' }, original)).toEqual({ endedAt: new Date(2026, 9, 27, 11, 15).toISOString(), note: '', target: { taskId: 't-nex-101' } })
  })
})
