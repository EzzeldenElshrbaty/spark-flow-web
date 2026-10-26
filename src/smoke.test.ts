import { describe, expect, it } from 'vitest'
import { formatDate } from '@/lib/format'

describe('tooling', () => {
  it('resolves @/ imports', () => {
    expect(formatDate('2026-10-03T10:00:00Z')).toBe('3 Oct 2026')
  })
})
