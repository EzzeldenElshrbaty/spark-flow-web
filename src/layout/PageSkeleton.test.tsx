// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BoardSkeleton } from '@/pages/projects/ProjectBoard'
import { PageSkeleton } from './PageSkeleton'

// UX Phase 4, 4.5: what shows while a page loads is shaped like the page, not one grey block.

afterEach(cleanup)

describe('skeletons shaped like the page', () => {
  it('a page: a title, four tiles and five rows, hidden from screen readers', () => {
    const { container } = render(<PageSkeleton />)
    expect((container.firstChild as HTMLElement).getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelectorAll('[data-pulse="tile"]')).toHaveLength(4)
    expect(container.querySelectorAll('[data-pulse="row"]')).toHaveLength(5)
  })

  it('the board: columns, each with a header and two cards', () => {
    const { container } = render(<BoardSkeleton />)
    const columns = container.querySelectorAll('[data-pulse="column"]')
    expect(columns.length).toBeGreaterThan(2)
    for (const column of columns) expect(column.querySelectorAll('[data-pulse="card"]')).toHaveLength(2)
  })
})
