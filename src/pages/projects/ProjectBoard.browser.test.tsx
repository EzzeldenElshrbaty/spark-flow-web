import '@/index.css'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import type { TaskView } from '@/api/types'
import { axeProblems } from '@/test/axe'
import { ProjectBoard } from './ProjectBoard'

// UX Phase 5A, 5.6 and 5.11: on the board Enter opens a card and Space moves it (the sidebar's rule), and a column's
// header is one plain button to move it, with its menu beside it, not inside.

afterEach(cleanup)

const task = (key: string, over: Partial<TaskView> = {}) =>
  ({ id: key, key, title: `Task ${key}`, status: 'todo', category: 'todo', phaseId: null, sprintId: null, assigneeId: null, priority: 'medium', type: 'task', dueAt: null, overdue: false, overEstimate: false, rank: 0, loggedHours: 0, estimateHours: null, updatedAt: '2026-11-01T00:00:00.000Z', ...over }) as unknown as TaskView

function Address() {
  const { search } = useLocation()
  return <output data-testid="address">{search}</output>
}

function mount(onMove = vi.fn(async () => {}), onMoveTo = vi.fn(async () => {})) {
  render(
    <MemoryRouter initialEntries={['/w/engineering/p/NEX/tasks']}>
      <ProjectBoard tickets={[task('NEX-1')]} users={[]} canMove={() => true} onMove={onMove} onMoveTo={onMoveTo} onBoard={async () => {}} />
      <Address />
    </MemoryRouter>,
  )
  return { onMove, onMoveTo }
}

const card = () => screen.getByRole('link', { name: /NEX-1/ })

describe('the board from the keyboard (UX Phase 5A)', () => {
  it('Tab reaches a card’s link, and Enter opens the task', async () => {
    await page.viewport(1280, 800)
    mount()
    card().focus()
    expect(document.activeElement).toBe(card())
    await userEvent.keyboard('{Enter}')
    expect(screen.getByTestId('address').textContent).toBe('?ticket=NEX-1')
  })

  it('Space picks the card up, → moves it to the next column, Space drops it, and focus stays on the card', async () => {
    await page.viewport(1280, 800)
    const { onMove, onMoveTo } = mount()
    card().focus()
    await userEvent.keyboard(' ')
    await userEvent.keyboard('{ArrowRight}')
    await userEvent.keyboard(' ')
    await vi.waitFor(() => expect(onMove.mock.calls.length + onMoveTo.mock.calls.length).toBe(1))
    expect(screen.getByTestId('address').textContent).toBe('')
    await vi.waitFor(() => expect(document.activeElement).toBe(card()))
  })

  it('Esc during a move puts the card back', async () => {
    await page.viewport(1280, 800)
    const { onMove, onMoveTo } = mount()
    card().focus()
    await userEvent.keyboard(' ')
    await userEvent.keyboard('{ArrowRight}')
    await userEvent.keyboard('{Escape}')
    expect(onMove).not.toHaveBeenCalled()
    expect(onMoveTo).not.toHaveBeenCalled()
  })

  it('a column’s header has a plain button to move it, named by its label, with the menu outside it; axe finds nothing', async () => {
    await page.viewport(1280, 800)
    mount()
    const column = screen.getByRole('region', { name: /^To do/ })
    const move = within(column).getByRole('button', { name: 'To do' })
    expect(move.getAttribute('aria-roledescription')).toBe('movable column')
    expect(move.contains(within(column).getByRole('button', { name: /Column actions|More/ }))).toBe(false)
    expect(await axeProblems(document, { skip: ['region'] })).toEqual([])
  })

  it('a column’s move button says how to move a column, not a task (UX Phase 6, deferred minor #27)', () => {
    mount()
    const column = screen.getAllByRole('button').find((b) => b.getAttribute('aria-roledescription') === 'movable column')!
    const said = (column.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ')
    expect(said).not.toContain('To move a task')
    expect(said).toContain('To move a column')
  })
})

