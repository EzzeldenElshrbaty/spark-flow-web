import '@/index.css'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import type { ProjectTab } from '@/lib/paths'
import { ProjectTabs } from './ProjectTabs'

// A real browser: the row scrolls sideways on a phone.

afterEach(cleanup)

const shown = (tab: ProjectTab, dir: 'ltr' | 'rtl' = 'ltr') => (
  <MemoryRouter>
    <div dir={dir} style={{ width: 200 }}>
      <ProjectTabs ws="engineering" projectKey="NEX" tab={tab} />
    </div>
  </MemoryRouter>
)

/** The open tab sits wholly inside the row's visible part. */
async function expectInView() {
  const row = screen.getByRole('navigation', { name: 'Project' })
  const open = row.querySelector('[aria-current=page]')!
  await vi.waitFor(() => {
    const r = row.getBoundingClientRect()
    const t = open.getBoundingClientRect()
    expect(t.left).toBeGreaterThanOrEqual(r.left - 0.5)
    expect(t.right).toBeLessThanOrEqual(r.right + 0.5)
  })
  return row
}

describe('ProjectTabs on a phone', () => {
  it('the open tab scrolls into view, the last one too, and back', async () => {
    const { rerender } = render(shown('files'))
    const row = screen.getByRole('navigation', { name: 'Project' })
    expect(row.scrollWidth).toBeGreaterThan(row.clientWidth)
    await expectInView()
    rerender(shown('overview'))
    await expectInView()
    expect(row.scrollLeft).toBe(0)
  })

  it('right to left as well', async () => {
    render(shown('files', 'rtl'))
    await expectInView()
  })

  it('a tab already in view doesn’t move the row', async () => {
    render(shown('tasks'))
    const row = await expectInView()
    expect(row.scrollLeft).toBe(0)
  })
})
