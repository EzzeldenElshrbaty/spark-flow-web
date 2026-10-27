import { describe, expect, it } from 'vitest'
import { parseFeatures } from '@/lib/features'

describe('parseFeatures', () => {
  it('turns on the known features listed in storage, outside production', () => {
    expect([...parseFeatures('chatRedesign, nonsense', false)]).toEqual(['chatRedesign'])
    expect(parseFeatures(null, false).size).toBe(0)
  })

  it('keeps every feature off in production', () => {
    expect(parseFeatures('chatRedesign', true).size).toBe(0)
  })
})
