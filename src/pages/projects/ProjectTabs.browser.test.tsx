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

describe('the tab row shows there’s more (UX Phase 5B, 5.2)', () => {
  it('an end fade while tabs are out of view, none at the end, and on the left in RTL', async () => {
    render(shown('overview'))
    const fade = () => document.querySelector<HTMLElement>('[data-more-tabs]')
    await vi.waitFor(() => expect(fade()).not.toBeNull())
    const row = screen.getByRole('navigation', { name: 'Project' })
    expect(fade()!.getBoundingClientRect().right).toBeGreaterThan(row.getBoundingClientRect().right - 2)
    row.scrollLeft = row.scrollWidth
    row.dispatchEvent(new Event('scroll'))
    await vi.waitFor(() => expect(fade()).toBeNull())
    cleanup()
    render(shown('overview', 'rtl'))
    await vi.waitFor(() => expect(fade()).not.toBeNull())
    const rtlRow = screen.getByRole('navigation', { name: 'Project' })
    expect(fade()!.getBoundingClientRect().left).toBeLessThan(rtlRow.getBoundingClientRect().left + 2)
  })
})

describe('the stuck row keeps the open tab in view (final review)', () => {
  it('when the project’s name appears, the open tab scrolls back into view', async () => {
    const { rerender } = render(
      <MemoryRouter>
        <div style={{ width: 300 }}>
          <ProjectTabs ws="engineering" projectKey="NEX" tab="files" sticky />
        </div>
      </MemoryRouter>,
    )
    await expectInView()
    rerender(
      <MemoryRouter>
        <div style={{ width: 300 }}>
          <ProjectTabs ws="engineering" projectKey="NEX" tab="files" sticky stuckName="Nexus Core" />
        </div>
      </MemoryRouter>,
    )
    await expectInView()
  })

  it('a long project name in the stuck row ends in an ellipsis (UX Phase 6)', () => {
    render(
      <MemoryRouter>
        <div style={{ width: 360 }}>
          <ProjectTabs ws="engineering" projectKey="NEX" tab="overview" sticky stuckName={'A project with a very long name that will not fit'} />
        </div>
      </MemoryRouter>,
    )
    const name = document.querySelector('[data-stuck-name] > span') as HTMLElement
    expect(name).toBeTruthy()
    expect(getComputedStyle(name).textOverflow).toBe('ellipsis')
    expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
  })
})
