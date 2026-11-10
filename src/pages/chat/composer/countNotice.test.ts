import { describe, expect, it } from 'vitest'
import { countNotice } from './countNotice'

describe('countNotice (UX Phase 5A, 5.12): read at a few steps, not on every key', () => {
  it('says nothing until fewer than 1,000 are left, then steps', () => {
    expect(countNotice(1000)).toBe('')
    expect(countNotice(999)).toBe('Fewer than 1,000 characters left.')
    expect(countNotice(500)).toBe('Fewer than 1,000 characters left.')
    expect(countNotice(499)).toBe('Fewer than 500 characters left.')
    expect(countNotice(100)).toBe('Fewer than 500 characters left.')
    expect(countNotice(99)).toBe('Fewer than 100 characters left.')
    expect(countNotice(1)).toBe('Fewer than 100 characters left.')
    expect(countNotice(0)).toBe('No characters left.')
    expect(countNotice(-10)).toBe('Too long to send. Remove some text.')
  })
})
