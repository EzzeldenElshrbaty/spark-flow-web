// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FilterBar } from './FilterBar'

afterEach(cleanup)

describe('FilterBar', () => {
  it('says no count before the total is known (UX Phase 6, deferred minor #15)', () => {
    render(
      <FilterBar shown={0} total={undefined} noun={['task', 'tasks']} active={0} onClear={() => {}}>
        <input aria-label="Search" />
      </FilterBar>,
    )
    expect(screen.getByRole('status').textContent).toBe('')
  })
})
