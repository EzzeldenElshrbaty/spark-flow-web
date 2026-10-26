import { describe, expect, it } from 'vitest'
import type { DashboardProject } from '@/api/types'
import { cardFacts } from './dashboardCard'

const now = new Date('2026-10-28T10:00:00Z')
const p = (over: Partial<DashboardProject>): DashboardProject =>
  ({ status: 'active', progress: 0, loggedHours: 0, estimateHours: null, dueDate: '2026-11-20T00:00:00.000Z', expectedFinish: '2026-11-20T00:00:00.000Z', taskCount: 0, ...over }) as DashboardProject

describe('cardFacts', () => {
  it('ring and hours', () => {
    expect(cardFacts(p({}), now)).toMatchObject({ ring: 0, hoursLine: '0h · no estimate', over: false })
    expect(cardFacts(p({ progress: 0.256, loggedHours: 115, estimateHours: 120 }), now)).toMatchObject({ ring: 26, hoursLine: '115h of 120h', over: false })
    expect(cardFacts(p({ loggedHours: 8 }), now).hoursLine).toBe('8h · no estimate')
    expect(cardFacts(p({ loggedHours: 130, estimateHours: 120 }), now).over).toBe(true)
  })

  it('late when the expected finish passes the due date, or the due date has passed and it is not delivered', () => {
    const late = cardFacts(p({ dueDate: '2026-10-25T00:00:00.000Z', expectedFinish: '2026-10-28T00:00:00.000Z' }), now)
    expect(late).toMatchObject({ late: true, finishLine: 'Expected 28 Oct 2026 · due 25 Oct' })
    expect(cardFacts(p({ dueDate: '2026-10-20T00:00:00.000Z', expectedFinish: '2026-10-20T00:00:00.000Z' }), now).late).toBe(true)
    expect(cardFacts(p({ status: 'delivered', dueDate: '2026-10-20T00:00:00.000Z', expectedFinish: '2026-10-20T00:00:00.000Z' }), now).late).toBe(false)
    expect(cardFacts(p({}), now)).toMatchObject({ late: false, finishLine: 'Expected 20 Nov 2026' })
  })
})
