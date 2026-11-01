import { describe, expect, it } from 'vitest'
import type { Rate } from '@/api/types'
import { currentRates, rateAt } from './rates'

const r = (id: string, userId: string, hourlyCost: number, effectiveFrom: string): Rate => ({ id, userId, hourlyCost, currency: 'EGP', effectiveFrom })
const rates = [r('1', 'a', 100, '2026-10-01T00:00:00.000Z'), r('2', 'a', 150, '2026-10-20T08:00:00.000Z'), r('3', 'b', 200, '2026-09-01T00:00:00.000Z')]

describe('rates over time', () => {
  it('rateAt picks the row in effect, the earliest before all rows, 0 without a rate', () => {
    expect(rateAt(rates, 'a', '2026-10-10T12:00:00.000Z')).toBe(100)
    expect(rateAt(rates, 'a', '2026-10-20T08:00:00.000Z')).toBe(150)
    expect(rateAt(rates, 'a', '2026-11-01T00:00:00.000Z')).toBe(150)
    expect(rateAt(rates, 'a', '2025-01-01T00:00:00.000Z')).toBe(100) // before every row: the earliest
    expect(rateAt(rates, 'nobody', '2026-10-10T12:00:00.000Z')).toBe(0)
  })
  it('currentRates keeps the latest per person', () => {
    expect(currentRates(rates).map((x) => x.id).sort()).toEqual(['2', '3'])
  })
})
