// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NewTaskButton } from '@/layout/NewTaskButton'

type P = { id: string; key: string; name: string; managerId: string; archivedAt?: string | null }
let projects: P[] = []
const manages = new Set<string>()

vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' } }) }))
vi.mock('@/api/projects', () => ({ useProjectSummaries: () => ({ data: projects }), usePhases: () => ({ data: [] }) }))
vi.mock('@/api/tickets', () => ({ useSprints: () => ({ data: [] }) }))
vi.mock('@/api/users', () => ({ useUsers: () => ({ data: [] }) }))
vi.mock('@/lib/usePermission', () => ({ usePermission: () => (_action: string, ctx: { project: P }) => manages.has(ctx.project.id) }))
vi.mock('@/pages/projects/TaskSheet', () => ({ TaskSheet: ({ project }: { project: P }) => <div role="dialog" aria-label={`New task in ${project.name}`} /> }))

beforeEach(() => {
  projects = [
    { id: 'p-nex', key: 'NEX', name: 'Nexus Core', managerId: 'u-1' },
    { id: 'p-mob', key: 'MOB', name: 'Mobile App', managerId: 'u-1' },
    { id: 'p-old', key: 'OLD', name: 'Old portal', managerId: 'u-1', archivedAt: '2026-10-01T00:00:00Z' },
  ]
  manages.clear()
})
afterEach(cleanup)
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const show = () => render(<MemoryRouter><NewTaskButton /></MemoryRouter>)

describe('NewTaskButton (spec 5.5: the Projects side’s button by the logo)', () => {
  it('is hidden when I may add tasks nowhere', () => {
    show()
    expect(screen.queryByRole('button', { name: 'New task' })).toBeNull()
  })

  it('opens the task sheet straight away when only one project takes my tasks', () => {
    manages.add('p-nex')
    show()
    fireEvent.click(screen.getByRole('button', { name: 'New task' }))
    expect(screen.getByRole('dialog', { name: 'New task in Nexus Core' })).toBeTruthy()
  })

  it('asks which project first when several do, leaving archived ones out', async () => {
    manages.add('p-nex').add('p-mob').add('p-old')
    show()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'New task' })))
    const items = screen.getAllByRole('menuitem').map((item) => item.textContent)
    expect(items).toEqual(['Nexus Core', 'Mobile App'])
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Mobile App' })))
    expect(screen.getByRole('dialog', { name: 'New task in Mobile App' })).toBeTruthy()
  })
})
