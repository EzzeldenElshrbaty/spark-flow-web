// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectRef } from '@/lib/permissions'
import { AddTimeSheet } from './AddTimeSheet'

// Add time for someone else (add time for): an Admin, or a project's manager on it, picks a Person after the task.

const add = vi.fn()
const nex = { id: 'p-nex', name: 'Nexus Core', managerId: 'u-2', memberIds: ['u-2', 'u-3', 'u-6'], teamIds: ['t-qa'] }
const mob = { id: 'p-mob', name: 'Mobile App', managerId: 'u-4', memberIds: ['u-2', 'u-8'], teamIds: [] }
const person = (id: string, name: string, teamIds: string[] = [], deactivated?: object) => ({ id, name, teamIds, roleIds: ['member'], deactivated })
const users = [person('u-2', 'Nour El-Sayed'), person('u-3', 'Mariam Fathy'), person('u-5', 'Salma Ibrahim', ['t-qa']), person('u-6', 'Hossam Gaber', [], { at: '2026-11-01' }), person('u-8', 'Tarek Lotfy')]
vi.mock('@/api/time', () => ({ useAddTime: () => ({ mutate: add, isPending: false, error: null }), useUpdateTime: () => ({ mutate: vi.fn(), isPending: false, error: null }) }))
vi.mock('@/api/tickets', () => ({ useArchivedTasks: () => ({ data: [] }) }))
vi.mock('./useLogTargets', () => ({ useLogTargets: () => ({ projects: [nex, mob], tasks: [], loaded: true }) }))
vi.mock('@/api/users', () => ({ useUsers: () => ({ data: users }) }))
vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering' } }) }))
vi.mock('@/lib/useRole', () => ({ useRole: () => ({ persona: { id: 'u-2' } }) }))
// Nour manages Nexus Core only.
vi.mock('@/lib/usePermission', () => ({ usePermission: () => (action: string, ctx?: { project?: ProjectRef }) => action === 'time.logFor' && ctx?.project?.managerId === 'u-2' }))
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

beforeEach(() => add.mockReset())
afterEach(cleanup)

// A required field's label ends with " *".
const field = (label: string) => screen.getByLabelText(new RegExp(`^${label}( \\*)?$`))
const pick = (label: string, value: string) => fireEvent.change(field(label), { target: { value } })
const options = (label: string) => within(field(label)).getAllByRole('option').map((o) => o.textContent)

describe('Add time for someone else', () => {
  it("shows Person only on a project I may add time for others on: Me, then its active people by name", () => {
    render(<AddTimeSheet onClose={() => {}} />)
    expect(screen.queryByLabelText('Person')).toBeNull()
    pick('Project', 'p-nex')
    expect(options('Person')).toEqual(['Me', 'Mariam Fathy', 'Salma Ibrahim'])
    pick('Project', 'p-mob')
    expect(screen.queryByLabelText('Person')).toBeNull()
  })

  it('sends the chosen person; Me sends none, and changing project goes back to Me', () => {
    render(<AddTimeSheet onClose={() => {}} />)
    pick('Project', 'p-nex')
    pick('Person', 'u-3')
    fireEvent.click(screen.getByRole('button', { name: 'Add time' }))
    expect(add.mock.calls[0]![0]).toMatchObject({ projectId: 'p-nex', userId: 'u-3' })
    pick('Project', 'p-mob')
    pick('Project', 'p-nex')
    expect((field('Person') as HTMLSelectElement).value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Add time' }))
    expect('userId' in add.mock.calls[1]![0]).toBe(false)
  })

  it('editing an entry has no Person: it stays whose it is', () => {
    const entry = { id: 'te-1', userId: 'u-3', addedBy: 'u-2', projectId: 'p-nex', taskId: null, startedAt: '2026-11-05T08:00:00.000Z', endedAt: '2026-11-05T09:00:00.000Z', source: 'manual' as const, note: '', endReason: null }
    render(<AddTimeSheet entry={entry} onClose={() => {}} />)
    expect(screen.queryByLabelText('Person')).toBeNull()
  })
})
