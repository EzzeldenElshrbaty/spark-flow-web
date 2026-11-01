import { describe, expect, it } from 'vitest'
import { missingRateLine } from './missingRates'

describe('missingRateLine', () => {
  it('counts people without a rate, one or many', () => {
    expect(missingRateLine([{ rate: 300 }])).toBeNull()
    expect(missingRateLine([{ rate: 0 }, { rate: 300 }])).toEqual({ text: '1 person has no hourly cost', action: 'Set it' })
    expect(missingRateLine([{ rate: 0 }, { rate: 0 }])).toEqual({ text: '2 people have no hourly cost', action: 'Set them' })
  })
})
