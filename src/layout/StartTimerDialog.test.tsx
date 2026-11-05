// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StartTimerDialog } from '@/layout/StartTimerDialog'

type P = { id: string; key: string; name: string; managerId: string }
type T = { id: string; key: string; title: string; assigneeId: string | null; category: 'todo' | 'inProgress' | 'done' }
let projects: P[] = []
let tasks: Record<string, T[]> = {}
const loggable = new Set<string>()
let firstStart = false
const start = { mutate: vi.fn(), isPending: false, error: null as Error | null }

vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' } }) }))
vi.mock('@/api/projects', () => ({ useProjectSummaries: () => ({ data: projects }) }))
vi.mock('@/api/tickets', () => ({ useTickets: (projectId?: string) => ({ data: projectId ? tasks[projectId] : undefined }) }))
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
      { id: 't-101', key: 'NEX-101', title: 'Login page', assigneeId: 'u-3', category: 'inProgress' },
      { id: 't-102', key: 'NEX-102', title: 'Invoices', assigneeId: 'u-1', category: 'todo' },
      { id: 't-103', key: 'NEX-103', title: 'Shipped', assigneeId: 'u-1', category: 'done' },
    ],
  }
  loggable.clear()
  loggable.add('p-nex')
  firstStart = false
  start.mutate.mockReset()
  start.isPending = false
  start.error = null
})
afterEach(cleanup)

const onClose = vi.fn()
const show = (title?: string) => render(<StartTimerDialog open onClose={onClose} title={title} />)
const select = (name: string) => screen.getByRole('combobox', { name }) as HTMLSelectElement

describe('StartTimerDialog (timer slice 1)', () => {
  it('Task waits for a project; picking both and Start timer starts that target', async () => {
    show()
    expect(screen.getByRole('dialog', { name: 'Start timer' })).toBeTruthy()
    expect(select('Task').disabled).toBe(true)
    // Only projects I may log on.
    expect(within(select('Project')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose…', 'Nexus Core'])
    await act(async () => fireEvent.change(select('Project'), { target: { value: 'p-nex' } }))
    expect(select('Task').disabled).toBe(false)
    // Mine first, done ones left out.
    expect(within(select('Task')).getAllByRole('option').map((o) => o.textContent)).toEqual(['No task', 'NEX-102 · Invoices', 'NEX-101 · Login page'])
    await act(async () => fireEvent.change(select('Task'), { target: { value: 't-102' } }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start timer' })))
    expect(start.mutate).toHaveBeenCalledWith({ taskId: 't-102' }, expect.objectContaining({ onSuccess: onClose }))
  })

  it('No task starts the timer on the project', async () => {
    show()
    await act(async () => fireEvent.change(select('Project'), { target: { value: 'p-nex' } }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start timer' })))
    expect(start.mutate).toHaveBeenCalledWith({ projectId: 'p-nex' }, expect.anything())
  })

  it('Start timer waits for a project, and says "Starting…" while it starts', async () => {
    show()
    expect((screen.getByRole('button', { name: 'Start timer' }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()
    start.isPending = true
    show()
    expect(screen.getByRole('button', { name: 'Starting…' })).toBeTruthy()
  })

  it('the notice shows while firstStart', () => {
    firstStart = true
    show()
    expect(screen.getByRole('dialog').textContent).toContain(
      'Starting a timer records the time, this device’s IP address and browser, and your location if you allow it. You, the managers of your projects and Admins can see them in Attendance.',
    )
    cleanup()
    firstStart = false
    show()
    expect(screen.getByRole('dialog').textContent).not.toContain('Starting a timer records')
  })

  it('with no project to log on it says "You aren\'t on any projects you can log time on." and has no Start', () => {
    loggable.clear()
    show()
    expect(screen.getByRole('dialog').textContent).toContain('You aren’t on any projects you can log time on.')
    expect(screen.queryByRole('button', { name: 'Start timer' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Project' })).toBeNull()
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
