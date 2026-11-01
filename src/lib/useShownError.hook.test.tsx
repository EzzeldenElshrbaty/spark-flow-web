// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useShownError } from './useShownError'

// Slice AB: an error over data loaded before (a 401 after signing out) set the last error and cleared it again on every
// render, which React stopped as "Too many re-renders".
describe('useShownError over cached data', () => {
  it('shows no error and settles', () => {
    const { result } = renderHook(() => useShownError({ data: { id: 'u-1' }, error: new Error('Signed out'), isFetching: false }))
    expect(result.current).toBeNull()
  })
})
