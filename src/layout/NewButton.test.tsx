// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NewButton } from '@/layout/NewButton'

type P = { id: string; key: string; name: string; managerId: string; archivedAt?: string | null }
let projects: P[] = []
const manages = new Set<string>()
let mayCreate = false

vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' } }) }))
vi.mock('@/api/projects', () => ({ useProjectSummaries: () => ({ data: projects }), usePhases: () => ({ data: [] }) }))
vi.mock('@/api/tickets', () => ({ useSprints: () => ({ data: [] }) }))
vi.mock('@/api/users', () => ({ useUsers: () => ({ data: [] }) }))
vi.mock('@/lib/usePermission', () => ({
  usePermission: () => (action: string, ctx?: { project: P }) => (action === 'project.create' ? mayCreate : Boolean(ctx && manages.has(ctx.project.id))),
}))
vi.mock('@/pages/projects/TaskSheet', () => ({
  TaskSheet: ({ project, onCreated, onClose }: { project: P; onCreated?: (t: { key: string }) => void; onClose: () => void }) => (
    <div role="dialog" aria-label={`New task in ${project.name}`}>
      <button
        type="button"
        onClick={() => {
          onCreated?.({ key: `${project.key}-111` })
          onClose()
        }}
      >
        Save task
      </button>
    </div>
  ),
}))
vi.mock('@/pages/projects/ProjectSheet', () => ({
  ProjectSheet: ({ takenKeys, onSaved, onClose }: { takenKeys: string[]; onSaved: (p: { key: string }) => void; onClose: () => void }) => (
    <div role="dialog" aria-label="New project" data-taken={takenKeys.join(',')}>
      <button type="button" onClick={() => onSaved({ key: 'NEW' })}>
        Save project
      </button>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </div>
  ),
}))

beforeEach(() => {
  projects = [
    { id: 'p-nex', key: 'NEX', name: 'Nexus Core', managerId: 'u-1' },
    { id: 'p-mob', key: 'MOB', name: 'Mobile App', managerId: 'u-1' },
    { id: 'p-old', key: 'OLD', name: 'Old portal', managerId: 'u-1', archivedAt: '2026-10-01T00:00:00Z' },
  ]
  manages.clear()
  mayCreate = false
})
afterEach(cleanup)
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

function Address() {
  const { pathname, search } = useLocation()
  return <p data-testid="address">{pathname + search}</p>
}
const show = () =>
  render(
    <MemoryRouter initialEntries={['/w/engineering/dashboard?days=14']}>
      <NewButton />
      <Address />
    </MemoryRouter>,
  )
const address = () => screen.getByTestId('address').textContent
const menuItems = () => screen.getAllByRole('menuitem').map((item) => item.textContent)

describe('NewButton (spec 5.5: the Projects side’s button by the logo)', () => {
  it('is hidden when I may add tasks nowhere and may not create projects', () => {
    show()
    expect(screen.queryByRole('button', { name: /^New/ })).toBeNull()
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
    expect(menuItems()).toEqual(['Nexus Core', 'Mobile App'])
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Mobile App' })))
    expect(screen.getByRole('dialog', { name: 'New task in Mobile App' })).toBeTruthy()
  })
})

describe('New project in the same menu (Admin and Sales)', () => {
  it('comes first, above the projects that take my tasks', async () => {
    mayCreate = true
    manages.add('p-nex').add('p-mob')
    show()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'New task or project' })))
    expect(menuItems()).toEqual(['New project', 'Nexus Core', 'Mobile App'])
  })

  it('makes one task project a choice too, instead of opening its task sheet at once', async () => {
    mayCreate = true
    manages.add('p-nex')
    show()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'New task or project' })))
    expect(menuItems()).toEqual(['New project', 'Nexus Core'])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the New project sheet straight away when it’s the only thing I may create', () => {
    mayCreate = true
    show()
    fireEvent.click(screen.getByRole('button', { name: 'New project' }))
    expect(screen.getByRole('dialog', { name: 'New project' })).toBeTruthy()
  })

  it('opens over the page I’m on and knows every key taken, archived ones too', async () => {
    mayCreate = true
    manages.add('p-nex')
    show()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'New task or project' })))
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'New project' })))
    expect(screen.getByRole('dialog', { name: 'New project' }).getAttribute('data-taken')).toBe('NEX,MOB,OLD')
    expect(address()).toBe('/w/engineering/dashboard?days=14')
  })

  it('after Save, opens the new project', () => {
    mayCreate = true
    show()
    fireEvent.click(screen.getByRole('button', { name: 'New project' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save project' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(address()).toBe('/w/engineering/p/NEW/overview')
  })

  it('after Cancel, leaves me where I was', () => {
    mayCreate = true
    show()
    fireEvent.click(screen.getByRole('button', { name: 'New project' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(address()).toBe('/w/engineering/dashboard?days=14')
  })
})

describe('a new task shows itself (UX Phase 1, 1.5)', () => {
  it('after Save, the new task’s panel opens on the page I am on', () => {
    manages.add('p-nex')
    show()
    fireEvent.click(screen.getByRole('button', { name: 'New task' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(address()).toBe('/w/engineering/dashboard?days=14&ticket=NEX-111')
  })
})
