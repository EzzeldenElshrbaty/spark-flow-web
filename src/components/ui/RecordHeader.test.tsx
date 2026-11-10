// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Pencil, Plus } from 'lucide-react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RecordHeader } from './RecordHeader'

window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
afterEach(cleanup)

const header = (compact?: boolean) =>
  render(
    <RecordHeader
      avatar={<span>NC</span>}
      title="Nexus Core"
      meta={[{ icon: <Pencil />, label: 'Spark Systems (internal)', title: 'Client' }]}
      primary={{ label: 'New task', icon: Plus, onSelect: vi.fn() }}
      secondary={[{ label: 'Edit project', icon: Pencil, onSelect: vi.fn() }]}
      compact={compact}
    />,
  )

describe('RecordHeader compact (UX Phase 1, 1.3: the project Chat tab)', () => {
  it('the full header has the facts row and the phone action bar', () => {
    const { container } = header()
    expect(screen.getByText('Spark Systems (internal)')).toBeTruthy()
    expect(container.querySelector('.fixed')).not.toBeNull()
  })

  it('compact leaves out the facts row and the pinned phone bar; on a phone the actions sit in ⋯ on the title row', () => {
    const { container } = header(true)
    expect(screen.queryByText('Spark Systems (internal)')).toBeNull()
    expect(container.querySelector('.fixed')).toBeNull()
    const more = screen.getAllByRole('button', { name: 'More actions' }).find((b) => b.closest('.sm\\:hidden'))!
    fireEvent.click(more)
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['New task', 'Edit project'])
  })
})

describe('RecordHeader on phones (UX Phase 5B, 5.1)', () => {
  it('the facts fold behind Details below sm; Details opens them; from sm they show without it', () => {
    header()
    const details = screen.getByRole('button', { name: 'Details' })
    expect(details.className).toContain('sm:hidden')
    expect(details.getAttribute('aria-expanded')).toBe('false')
    const facts = document.getElementById(details.getAttribute('aria-controls')!)!
    expect(facts.className).toContain('max-sm:hidden')
    fireEvent.click(details)
    expect(details.getAttribute('aria-expanded')).toBe('true')
    expect(facts.className).not.toContain('max-sm:hidden')
  })

  it('pinned={false} puts the actions under ⋯ on the title row and keeps the facts', () => {
    render(
      <RecordHeader
        avatar={<span>NC</span>}
        title="Nexus Core"
        meta={[{ icon: <Pencil />, label: 'Spark Systems (internal)' }]}
        primary={{ label: 'New task', icon: Plus, onSelect: vi.fn() }}
        pinned={false}
      />,
    )
    expect(document.querySelector('[data-pinned-actions]')).toBeNull()
    expect(screen.getByText('Spark Systems (internal)')).toBeTruthy()
  })
})
