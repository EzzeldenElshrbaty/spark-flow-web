import '@/index.css'
import { cleanup, render, screen } from '@testing-library/react'
import { Pencil } from 'lucide-react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { RowMenu } from '@/components/RowMenu'
import { Sheet } from '@/components/ui/Sheet'
import { InspectorFrame } from '@/layout/InspectorFrame'
import { roundButton } from '@/layout/roundButton'
import { answersTouch } from '@/test/touch'

// UX Phase 5B (5.4): on a phone every small control answers a 44px touch; at 1280 nothing moves.

afterEach(async () => {
  cleanup()
  await page.viewport(414, 896)
})

function Row() {
  return (
    <header className="sf flex items-center gap-2 p-4">
      <button type="button" className={roundButton} aria-label="Help">
        ?
      </button>
      <button type="button" className={roundButton} aria-label="Search">
        S
      </button>
    </header>
  )
}

describe('touch areas (UX Phase 5B, 5.4)', () => {
  it('the top bar’s round shape carries the touch area', () => {
    expect(roundButton).toContain('max-md:touch-target')
  })

  it('a top bar round button: a 44px touch up and down, and its own edge stays its own beside a neighbour', async () => {
    await page.viewport(390, 844)
    render(<Row />)
    const help = screen.getByRole('button', { name: 'Help' })
    const search = screen.getByRole('button', { name: 'Search' })
    expect(answersTouch(help).slice(0, 2)).toEqual([true, true])
    const r = help.getBoundingClientRect()
    expect(help.contains(document.elementFromPoint(r.right - 2, r.top + r.height / 2))).toBe(true)
    const s = search.getBoundingClientRect()
    expect(search.contains(document.elementFromPoint(s.left + 2, s.top + s.height / 2))).toBe(true)
  })

  it('a sheet’s ×, a panel’s × and a row’s ⋯ answer on all four sides', async () => {
    await page.viewport(390, 844)
    render(
      <MemoryRouter>
        <InspectorFrame label="Task" title="NEX-1" onClose={() => {}}>
          <RowMenu label="More for Build" items={[{ label: 'Rename', icon: Pencil, onSelect: () => {} }]} />
        </InspectorFrame>
      </MemoryRouter>,
    )
    expect(answersTouch(screen.getByRole('button', { name: 'Close task' }))).toEqual([true, true, true, true])
    expect(answersTouch(screen.getByRole('button', { name: 'More for Build' }))).toEqual([true, true, true, true])
    cleanup()
    render(
      <Sheet open title="New task" onClose={() => {}}>
        <p>Form</p>
      </Sheet>,
    )
    expect(answersTouch(screen.getByRole('button', { name: 'Close' }))).toEqual([true, true, true, true])
  })

  it('at 1280 the round button keeps its 32px box (the layout doesn’t move)', async () => {
    await page.viewport(1280, 800)
    render(<Row />)
    expect(screen.getByRole('button', { name: 'Help' }).getBoundingClientRect().width).toBe(32)
  })
})
