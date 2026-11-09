import { describe, expect, it } from 'vitest'
import { columnSortFrom, sortParams } from './sorting'

// UX Phase 4, 4.7: a page whose `by` already means something else (Time & cost's grouping) keeps its column sort under
// another key.
describe('column sort in the address', () => {
  it('reads and writes `by` by default', () => {
    expect(columnSortFrom(new URLSearchParams('by=name&dir=desc'))).toEqual({ by: 'name', dir: 'desc' })
    expect(sortParams({ by: 'name', dir: 'asc' })).toEqual({ by: 'name', dir: 'asc' })
  })

  it('or under the key a page names', () => {
    expect(columnSortFrom(new URLSearchParams('by=person&sort=hours&dir=desc'), 'sort')).toEqual({ by: 'hours', dir: 'desc' })
    expect(sortParams({ by: 'hours', dir: 'asc' }, 'sort')).toEqual({ sort: 'hours', dir: 'asc' })
    expect(sortParams(null, 'sort')).toEqual({ sort: null, dir: null })
  })
})
