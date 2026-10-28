// @vitest-environment jsdom
import { IconHash } from '@tabler/icons-react'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { SideLink } from '@/layout/Sidebar'

afterEach(cleanup)

const row = (props: Partial<Parameters<typeof SideLink>[0]>, at = '/elsewhere') =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <SideLink to="/c/backend" label="backend" icon={IconHash} collapsed={false} {...props} />
    </MemoryRouter>,
  )

describe('SideLink states (spec 5.1)', () => {
  it('shows mentions as a red count and reads it out, bold', () => {
    row({ mentions: 3 })
    const link = screen.getByRole('link', { name: /^backend,\s*3\s*mentions$/ })
    expect(link.className).toContain('font-semibold')
  })

  it('a count can name what it counts (Activity counts unread items, spec 6.12), collapsed too', () => {
    row({ label: 'Activity', mentions: 4, noun: ['unread', 'unread'] })
    expect(screen.getByRole('link', { name: /^Activity,\s*4\s*unread$/ })).toBeTruthy()
    cleanup()
    row({ label: 'Activity', mentions: 1, noun: ['unread', 'unread'], collapsed: true })
    expect(screen.getByRole('link', { name: 'Activity' }).textContent).toBe(', 1 unread')
  })

  it('a muted row is dim and never shows a count', () => {
    row({ muted: true, mentions: 3, unread: true })
    const link = screen.getByRole('link', { name: 'backend' })
    expect(link.className).toContain('text-sf-sidebar-text-muted')
    expect(link.className).toContain('font-normal')
  })

  it('the active row gets the active background and accent icon', () => {
    row({}, '/c/backend')
    const link = screen.getByRole('link', { name: 'backend' })
    expect(link.getAttribute('aria-current')).toBe('page')
    expect(link.className).toContain('bg-sf-sidebar-active')
    expect(link.querySelector('svg')?.getAttribute('class')).toContain('text-sf-sidebar-accent')
  })

  it('a row can opt out of lighting up on its route', () => {
    row({ active: false }, '/c/backend')
    expect(screen.getByRole('link', { name: 'backend' }).className).not.toContain('bg-sf-sidebar-active')
  })
})
