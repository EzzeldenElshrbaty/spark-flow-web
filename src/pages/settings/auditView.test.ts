import { describe, expect, it } from 'vitest'
import type { AuditEvent } from '@/api/types'
import { breakHere, chainText, changeSummary, dayStart, filterFrom, periodSince } from './auditView'

const now = new Date(2026, 9, 31, 14, 30) // 31 Oct 2026, 2:30 PM where the test runs

describe('the audit log page’s reading of the address and its entries (slice 2)', () => {
  it('a period starts at the start of my day: today, or 7 or 30 days counting today; any time is none', () => {
    expect(periodSince('today', now)).toBe(new Date(2026, 9, 31).toISOString())
    expect(periodSince('7d', now)).toBe(new Date(2026, 9, 25).toISOString())
    expect(periodSince('30d', now)).toBe(new Date(2026, 9, 2).toISOString())
    expect(periodSince('', now)).toBeNull()
    expect(periodSince('forever', now)).toBeNull()
    expect(dayStart(now)).toBe(periodSince('today', now))
  })

  it('the filter takes what the address says and leaves out what it doesn’t know', () => {
    expect(filterFrom(new URLSearchParams('q=%20nexus%20&period=today&person=u-3&type=project&result=refused&group=access'), now)).toEqual({
      q: 'nexus', since: new Date(2026, 9, 31).toISOString(), actorId: 'u-3', recordType: 'project', result: 'refused', group: 'access',
    })
    expect(filterFrom(new URLSearchParams('q=%20&result=maybe&group=everything'), now)).toEqual({ q: undefined, since: null, actorId: null, recordType: null, result: null, group: null })
  })

  it('a row shows the first change and how many more, or the detail when no field changed', () => {
    const event = { changes: [{ field: 'Due date', from: '1 Nov 2026', to: '8 Nov 2026' }], detail: null } as unknown as AuditEvent
    expect(changeSummary(event)).toBe('Due date: 1 Nov 2026 → 8 Nov 2026')
    expect(changeSummary({ ...event, changes: [...event.changes, { field: 'Client', from: null, to: 'Spark' }, { field: 'About', from: 'x', to: null }] })).toBe('Due date: 1 Nov 2026 → 8 Nov 2026 · 2 more')
    expect(changeSummary({ ...event, changes: [], detail: 'Password' })).toBe('Password')
    expect(changeSummary({ ...event, changes: [] })).toBe('—')
  })

  it('the tamper check says intact with how much it checked, or where and why it breaks', () => {
    expect(chainText({ intact: true, checked: 1 })).toEqual({ ok: true, value: 'Intact', note: '1 entry checked' })
    expect(chainText({ intact: false, checked: 9, brokenAt: 4, reason: 'removed' })).toEqual({ ok: false, value: 'Broken', note: 'At #4: one before it is missing' })
    expect(breakHere({ intact: false, checked: 9, brokenAt: 4, reason: 'reordered' }, 4)).toBe('This entry is out of order.')
    expect(breakHere({ intact: false, checked: 9, brokenAt: 4, reason: 'reordered' }, 5)).toBeNull()
    expect(breakHere(undefined, 4)).toBeNull()
  })
})
