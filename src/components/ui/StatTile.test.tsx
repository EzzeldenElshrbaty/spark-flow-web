// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { Ban } from 'lucide-react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { StatTile } from './StatTile'

// UX Phase 3 (3.5): one stat tile, the kit's StatCard look, for the Dashboard, Overview, Time & cost, Audit log and Settings.

afterEach(cleanup)

describe('StatTile', () => {
  it('label and value are siblings, in the kit look; the value is red only for danger', () => {
    render(
      <>
        <StatTile label="Hours, last 7 days" value="6.5h" />
        <StatTile label="Overdue tasks" value="2" hint="1 over estimate" tone="danger" />
      </>,
    )
    const label = screen.getByText('Hours, last 7 days')
    expect(label.parentElement!.textContent).toBe('Hours, last 7 days6.5h')
    expect(label.parentElement!.className).toContain('rounded-xl border border-line bg-surface p-4 shadow-sm sm:p-5')
    expect(screen.getByText('6.5h').className).toContain('text-fg')
    expect(screen.getByText('2').className).toContain('text-red-600')
    expect(screen.getByText('1 over estimate').className).toContain('text-xs text-fg-muted')
  })

  it('opens its page when it has one', () => {
    render(
      <MemoryRouter>
        <StatTile label="Teams" value={4} to="/w/engineering/teams" />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: /Teams/ })
    expect(link.getAttribute('href')).toBe('/w/engineering/teams')
    expect(link.className).toContain('focus-visible:outline-brand-500')
  })

  it('an icon sits in the corner, not between the label and the value; extra content goes last', () => {
    render(
      <StatTile label="Access denied" value={1} icon={Ban} iconTone="bg-amber-50 text-amber-700">
        <p>bar</p>
      </StatTile>,
    )
    const label = screen.getByText('Access denied')
    expect(label.nextElementSibling!.textContent).toBe('1')
    expect(label.parentElement!.querySelector('svg')!.parentElement!.className).toContain('bg-amber-50')
    expect(label.parentElement!.lastElementChild!.textContent).toBe('bar')
  })
})
