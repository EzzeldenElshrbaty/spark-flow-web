// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectRef } from '@/lib/permissions'
import { AddTimeSheet } from './AddTimeSheet'

// Add time for someone else (add time for): an Admin, or a project's manager on it, picks a Person after the task.

const add = vi.fn()
let addError: Error | null = null
const nex = { id: 'p-nex', name: 'Nexus Core', managerId: 'u-2', memberIds: ['u-2', 'u-3', 'u-6'], teamIds: ['t-qa'] }
const mob = { id: 'p-mob', name: 'Mobile App', managerId: 'u-4', memberIds: ['u-2', 'u-8'], teamIds: [] }
const person = (id: string, name: string, teamIds: string[] = [], deactivated?: object) => ({ id, name, teamIds, roleIds: ['member'], deactivated })
const users = [person('u-2', 'Nour El-Sayed'), person('u-3', 'Mariam Fathy'), person('u-5', 'Salma Ibrahim', ['t-qa']), person('u-6', 'Hossam Gaber', [], { at: '2026-11-01' }), person('u-8', 'Tarek Lotfy')]
vi.mock('@/api/time', () => ({ useAddTime: () => ({ mutate: add, isPending: false, error: addError }), useUpdateTime: () => ({ mutate: vi.fn(), isPending: false, error: null }) }))
vi.mock('@/api/tickets', () => ({ useArchivedTasks: () => ({ data: [] }) }))
vi.mock('./useLogTargets', () => ({ useLogTargets: () => ({ projects: [nex, mob], tasks: [], loaded: true }) }))
vi.mock('@/api/users', () => ({ useUsers: () => ({ data: users }) }))
vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering' } }) }))
vi.mock('@/lib/useRole', () => ({ useRole: () => ({ persona: { id: 'u-2' } }) }))
// Nour manages Nexus Core only.
vi.mock('@/lib/usePermission', () => ({ usePermission: () => (action: string, ctx?: { project?: ProjectRef }) => action === 'time.logFor' && ctx?.project?.managerId === 'u-2' }))
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

beforeEach(() => {
  add.mockReset()
  addError = null
})
afterEach(cleanup)

// A required field's label ends with " *".
const field = (label: string) => screen.getByLabelText(new RegExp(`^${label}( \\*)?$`))
const pick = (label: string, value: string) => fireEvent.change(field(label), { target: { value } })
const options = (label: string) => within(field(label)).getAllByRole('option').map((o) => o.textContent)

describe('Add time: whose time, picked every time (11 Nov 2026)', () => {
  it('lists only the projects I may add time on (an Admin, or their manager)', () => {
    render(<AddTimeSheet onClose={() => {}} />)
    expect(options('Project')).toEqual(['Choose…', 'Nexus Core'])
  })

  it('asks whose time it is: Choose…, Me, then the project’s active people by name', () => {
    render(<AddTimeSheet onClose={() => {}} />)
    pick('Project', 'p-nex')
    expect(options('Person')).toEqual(['Choose…', 'Me', 'Mariam Fathy', 'Salma Ibrahim'])
    expect((field('Person') as HTMLSelectElement).value).toBe('')
  })

  it('Save without a person says “Choose who this time is for.” and sends nothing', () => {
    render(<AddTimeSheet onClose={() => {}} />)
    pick('Project', 'p-nex')
    fireEvent.click(screen.getByRole('button', { name: 'Add time' }))
    expect(screen.getByText('Choose who this time is for.')).toBeTruthy()
    expect(add).not.toHaveBeenCalled()
  })

  it('sends the chosen person, Me as my own id; changing project asks again', () => {
    render(<AddTimeSheet onClose={() => {}} />)
    pick('Project', 'p-nex')
    pick('Person', 'u-3')
    fireEvent.click(screen.getByRole('button', { name: 'Add time' }))
    expect(add.mock.calls[0]![0]).toMatchObject({ projectId: 'p-nex', userId: 'u-3' })
    pick('Person', 'u-2')
    fireEvent.click(screen.getByRole('button', { name: 'Add time' }))
    expect(add.mock.calls[1]![0]).toMatchObject({ projectId: 'p-nex', userId: 'u-2' })
    pick('Project', '')
    pick('Project', 'p-nex')
    expect((field('Person') as HTMLSelectElement).value).toBe('')
  })

  it('editing an entry has no Person: it stays whose it is', () => {
    const entry = { id: 'te-1', userId: 'u-3', addedBy: 'u-2', projectId: 'p-nex', taskId: null, startedAt: '2026-11-05T08:00:00.000Z', endedAt: '2026-11-05T09:00:00.000Z', source: 'manual' as const, note: '', endReason: null }
    render(<AddTimeSheet entry={entry} onClose={() => {}} />)
    expect(screen.queryByLabelText(/^Person/)).toBeNull()
  })
})

describe('Add time asks before discarding (UX Phase 1, 1.2)', () => {
  it('untouched, Cancel closes; with a note typed it asks "Discard this time entry?"', () => {
    const onClose = vi.fn()
    render(<AddTimeSheet onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    cleanup()
    const onClose2 = vi.fn()
    render(<AddTimeSheet onClose={onClose2} />)
    fireEvent.change(screen.getByRole('textbox', { name: /Note/ }), { target: { value: 'Pairing' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Discard this time entry?')).toBeTruthy()
    expect(onClose2).not.toHaveBeenCalled()
  })
})

describe('Add time checks as you fix (UX Phase 4, 4.4)', () => {
  it('the project error shows on Save and leaves once a project is picked; Enter saves', () => {
    render(<AddTimeSheet onClose={() => {}} />)
    expect(screen.queryByText('Pick a project.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add time' }))
    expect(screen.getByText('Pick a project.')).toBeTruthy()
    // The label holds the error too while it shows.
    fireEvent.change(screen.getByLabelText(/^Project/), { target: { value: 'p-nex' } })
    expect(screen.queryByText('Pick a project.')).toBeNull()
    const note = screen.getByLabelText(/^Note/) as HTMLInputElement
    expect(note.form?.querySelector('button[type="submit"]')).toBeTruthy()
  })

  it('a refusal from the server (an overlap) shows right under the times, not after the note', () => {
    addError = new Error('This overlaps time you already logged, 9:00 AM to 10:00 AM.')
    render(<AddTimeSheet onClose={() => {}} />)
    const alert = screen.getByRole('alert')
    expect(alert.previousElementSibling?.textContent).toContain('End')
  })
})
