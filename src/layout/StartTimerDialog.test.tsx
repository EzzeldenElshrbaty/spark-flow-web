// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StartTimerDialog } from '@/layout/StartTimerDialog'
import { useUiStore } from '@/lib/uiStore'

type P = { id: string; key: string; name: string; managerId: string }
type T = { id: string; key: string; title: string; projectId: string; assigneeId: string | null; category: 'todo' | 'inProgress' | 'done'; overdue?: boolean; overEstimate?: boolean; dueAt?: string | null }
let projects: P[] = []
let tasks: Record<string, T[]> = {}
const loggable = new Set<string>()
let firstStart = false
const start = { mutate: vi.fn(), isPending: false, error: null as Error | null }

vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' } }) }))
vi.mock('@/api/projects', () => ({ useProjectSummaries: () => ({ data: projects }) }))
vi.mock('@/api/tickets', () => ({
  useTickets: (projectId?: string) => ({ data: projectId ? tasks[projectId] : undefined }),
  useTasksOf: (projectIds: string[]) => ({ data: projectIds.flatMap((id) => tasks[id] ?? []), isPending: false }),
}))
vi.mock('@/api/users', () => ({ useMe: () => ({ data: { id: 'u-1', teamIds: [] } }) }))
vi.mock('@/lib/usePermission', () => ({ usePermission: () => (_action: string, ctx: { project: P }) => loggable.has(ctx.project.id) }))
vi.mock('@/api/time', () => ({ useMyDay: () => ({ data: { firstStart } }), useStartTimer: () => start }))

beforeEach(() => {
  projects = [
    { id: 'p-nex', key: 'NEX', name: 'Nexus Core', managerId: 'u-2' },
    { id: 'p-mob', key: 'MOB', name: 'Mobile App', managerId: 'u-2' },
  ]
  tasks = {
    'p-nex': [
      { id: 't-101', key: 'NEX-101', title: 'Login page', projectId: 'p-nex', assigneeId: 'u-3', category: 'inProgress' },
      { id: 't-102', key: 'NEX-102', title: 'Invoices', projectId: 'p-nex', assigneeId: 'u-1', category: 'todo' },
      { id: 't-103', key: 'NEX-103', title: 'Shipped', projectId: 'p-nex', assigneeId: 'u-1', category: 'done' },
    ],
  }
  loggable.clear()
  loggable.add('p-nex')
  firstStart = false
  start.mutate.mockReset()
  start.isPending = false
  start.error = null
  useUiStore.setState({ recentTimers: {} })
})
afterEach(cleanup)

const onClose = vi.fn()
const show = (title?: string) => render(<StartTimerDialog open onClose={onClose} title={title} />)
const box = () => screen.getByRole('combobox', { name: 'Find a task' }) as HTMLInputElement
const options = () => screen.getAllByRole('option').map((o) => o.textContent)

describe('StartTimerDialog (UX Phase 4, 4.3: find a task, start in two clicks)', () => {
  it('lists my open tasks first; ↓ then Enter starts the first one', async () => {
    show()
    expect(screen.getByRole('dialog', { name: 'Start timer' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'My tasks' })).toBeTruthy()
    expect(options()).toEqual(['NEX-102 · InvoicesNexus Core'])
    fireEvent.keyDown(box(), { key: 'ArrowDown' })
    await act(async () => fireEvent.keyDown(box(), { key: 'Enter' }))
    expect(start.mutate).toHaveBeenCalledWith({ taskId: 't-102' }, expect.anything())
  })

  it('words find any open task on a project I may log on; a click starts it', async () => {
    show()
    fireEvent.change(box(), { target: { value: 'login' } })
    expect(screen.getByRole('group', { name: 'Matches' })).toBeTruthy()
    expect(options()).toEqual(['NEX-101 · Login pageNexus Core'])
    await act(async () => fireEvent.click(screen.getByRole('option')))
    expect(start.mutate).toHaveBeenCalledWith({ taskId: 't-101' }, expect.anything())
  })

  it('a start is remembered for Recent', async () => {
    start.mutate.mockImplementation((_target, { onSuccess }) => onSuccess())
    show()
    fireEvent.change(box(), { target: { value: 'login' } })
    await act(async () => fireEvent.click(screen.getByRole('option')))
    expect(useUiStore.getState().recentTimers['u-1:ws-eng']).toEqual(['task:t-101'])
    expect(onClose).toHaveBeenCalled()
    cleanup()
    show()
    expect(screen.getByRole('group', { name: 'Recent' }).textContent).toContain('NEX-101')
  })

  it('on my first start, a pick shows the notice and Start confirms', async () => {
    firstStart = true
    show()
    expect(screen.getByRole('dialog').textContent).toContain(
      'Starting a timer records the time, this device’s IP address and browser, and your location if you allow it. You, the managers of your projects and Admins can see them in Attendance.',
    )
    await act(async () => fireEvent.click(screen.getByRole('option')))
    expect(start.mutate).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start timer' })))
    expect(start.mutate).toHaveBeenCalledWith({ taskId: 't-102' }, expect.anything())
  })

  it('Log on the project only: a project, then Start', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Log on the project only' }))
    const project = screen.getByRole('combobox', { name: 'Project' }) as HTMLSelectElement
    expect(within(project).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose…', 'Nexus Core'])
    // Start says why it can't start yet, under the picker (UX Phase 6), instead of sitting disabled.
    fireEvent.click(screen.getByRole('button', { name: 'Start timer' }))
    expect(start.mutate).not.toHaveBeenCalled()
    expect(screen.getByText('Pick a project.')).toBeTruthy()
    expect(project.getAttribute('aria-invalid')).toBe('true')
    fireEvent.change(project, { target: { value: 'p-nex' } })
    expect(screen.queryByText('Pick a project.')).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start timer' })))
    expect(start.mutate).toHaveBeenCalledWith({ projectId: 'p-nex' }, expect.anything())
  })

  it('with no project to log on it says so and has no Start', () => {
    loggable.clear()
    show()
    expect(screen.getByRole('dialog').textContent).toContain('You aren’t on any projects you can log time on.')
    expect(screen.queryByRole('button', { name: 'Start timer' })).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('a refused start shows its error in the dialog', () => {
    start.error = new Error('That task is done. Reopen it to log time.')
    show()
    expect(screen.getByRole('alert').textContent).toBe('That task is done. Reopen it to log time.')
  })

  it('Switch task uses the same dialog under its own title', () => {
    show('Switch task')
    expect(screen.getByRole('dialog', { name: 'Switch task' })).toBeTruthy()
  })
})

describe('Start timer, final review', () => {
  it('↓ scrolls the highlighted task into view', () => {
    const scrolled = vi.fn()
    Element.prototype.scrollIntoView = scrolled
    show()
    fireEvent.change(box(), { target: { value: 'NEX' } })
    fireEvent.keyDown(box(), { key: 'ArrowDown' })
    expect(scrolled.mock.contexts.at(-1)).toBe(screen.getAllByRole('option')[1])
  })

  it('while a start is on its way, a second pick sends nothing and the dialog says “Starting…”', async () => {
    start.isPending = true
    show()
    await act(async () => fireEvent.click(screen.getByRole('option')))
    expect(start.mutate).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe('Starting…')
  })
})
