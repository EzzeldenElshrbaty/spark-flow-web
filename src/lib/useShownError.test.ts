import { describe, expect, it } from 'vitest'
import { shownError } from './useShownError'

describe('shownError', () => {
  const failed = new Error('down')
  it('keeps the last error while a refetch with no data runs, and drops it once data comes', () => {
    expect(shownError({ error: failed, hasData: false, fetching: false }, null)).toBe(failed)
    // TanStack clears the error when it refetches a query that has no data.
    expect(shownError({ error: null, hasData: false, fetching: true }, failed)).toBe(failed)
    expect(shownError({ error: null, hasData: true, fetching: false }, failed)).toBeNull()
    // A first load that hasn't failed shows no error.
    expect(shownError({ error: null, hasData: false, fetching: true }, null)).toBeNull()
  })
})
