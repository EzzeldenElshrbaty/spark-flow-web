import { describe, expect, it } from 'vitest'
import type { TimeReport } from '@/api/types'
import { reportRows } from './reportCsv'

const report = {
  totals: { hours: 3, cost: 900, people: 1 },
  byProject: [{ projectId: 'p1', hours: 3, cost: 900 }],
  byPerson: [{ userId: 'u1', rate: 300, hours: 3, cost: 900 }],
  byWeek: [{ weekStart: '2026-10-25T00:00:00.000Z', hours: 3, cost: 900 }],
} as TimeReport

describe('reportRows', () => {
  it('the table on screen, money as plain numbers', () => {
    const names = { project: () => 'Nexus Core', person: () => 'Mariam Fathy' }
    expect(reportRows(report, 'project', names)).toEqual([['Project', 'Hours', 'Cost (EGP)'], ['Nexus Core', 3, 900]])
    expect(reportRows(report, 'person', names)).toEqual([['Person', 'Rate (EGP/h)', 'Hours', 'Cost (EGP)'], ['Mariam Fathy', 300, 3, 900]])
    expect(reportRows(report, 'week', names)[1]![0]).toBe('2026-10-25')
  })
})
