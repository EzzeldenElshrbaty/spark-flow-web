// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SortableSideList } from './SortableSideList'

afterEach(cleanup)

describe('the sidebar’s lists hold only rows (UX Phase 5A, 5.11: axe "list")', () => {
  it('the drag announcements and instructions sit outside the list', () => {
    const { container } = render(
      <ul>
        <SortableSideList label="Channels" items={[{ id: 'c1', label: 'general', muted: false }, { id: 'c2', label: 'backend', muted: false }]} onReorder={() => {}}>
          {(item) => <a href={`/c/${item.id}`}>{item.label}</a>}
        </SortableSideList>
      </ul>,
    )
    expect(container.querySelectorAll('ul > :not(li)')).toHaveLength(0)
    expect(document.querySelector('[role="status"]')).not.toBeNull()
  })
})
