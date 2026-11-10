// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BoardColumn, Phase, ProjectSummary } from '@/api/types'
import { ColumnSheet } from './ColumnSheet'
import { DeleteColumnSheet } from './DeleteColumnSheet'
import { DeliverableSheet } from './DeliverableSheet'
import { PhasesSheet } from './PhasesSheet'
import { ProjectSheet } from './ProjectSheet'

// UX Phase 1, 1.2: the project page's other sheets ask before throwing away what was typed.

const mutation = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, error: null, reset: vi.fn() }
vi.mock('@/api/projects', () => ({
  useCreateProject: () => mutation,
  useUpdateProject: () => mutation,
  useTeams: () => ({ data: [] }),
  useCreatePhase: () => mutation,
  useUpdatePhase: () => mutation,
  useRemovePhase: () => mutation,
  useReorderPhases: () => mutation,
  useAddColumn: () => mutation,
  useSetBoard: () => mutation,
  useCreateDeliverable: () => mutation,
  useDeleteColumn: () => mutation,
  useUpdateDeliverable: () => mutation,
}))
vi.mock('@/api/tickets', () => ({ useTickets: () => ({ data: [] }) }))
vi.mock('@/api/users', () => ({ useUsers: () => ({ data: [] }) }))
vi.mock('@/lib/usePermission', () => ({ usePermission: () => () => true }))
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

afterEach(cleanup)

const project = { id: 'p-nex', key: 'NEX', name: 'Nexus Core', currentPhaseId: null, dueDate: '2026-12-04T00:00:00.000Z', managerId: 'u-2', memberIds: [], teamIds: [] } as unknown as ProjectSummary
const phase = { id: 'ph-1', projectId: 'p-nex', name: 'Build', order: 1, startDate: '2026-11-01T00:00:00.000Z', dueDate: '2026-11-18T00:00:00.000Z', status: 'inProgress' } as Phase

describe('project sheets ask before discarding', () => {
  it('New project: untouched Cancel closes; a typed name asks "Discard this new project?"', () => {
    const onClose = vi.fn()
    render(<ProjectSheet workspaceId="ws-eng" takenKeys={[]} onClose={onClose} onSaved={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByRole('textbox', { name: /^Name/ }), { target: { value: 'Atlas' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Discard this new project?')).toBeTruthy()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Phases: Escape no longer closes it, and Done asks while a phase edit or a new name isn’t saved', () => {
    const onClose = vi.fn()
    render(<PhasesSheet project={project} phases={[phase]} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByRole('textbox', { name: 'Phase name' }), { target: { value: 'Build and test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Discard your changes?')).toBeTruthy()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('New column and New deliverable ask once something is typed', () => {
    const onClose = vi.fn()
    render(<ColumnSheet projectId="p-nex" columns={[]} onClose={onClose} />)
    fireEvent.change(screen.getByRole('textbox', { name: /^Name/ }), { target: { value: 'QA' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Discard this new column?')).toBeTruthy()
    cleanup()
    render(<DeliverableSheet project={project} phases={[phase]} onClose={onClose} />)
    fireEvent.change(screen.getByRole('textbox', { name: /^Title/ }), { target: { value: 'Release notes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Discard this new deliverable?')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })
})

// UX Phase 4, 4.4: errors show from the first Save, leave as soon as the field is fixed, sit under their own field,
// and Enter in a field saves (the form holds a submit button, as Users' sheet does).
// A field and what's under it (UX Phase 5A: the error sits after the label, inside the Field).
const fieldOf = (text: string) => {
  const found = screen.getByText(text)
  return (found.closest('label') ?? found).parentElement
}
const hasSubmit = (input: HTMLElement) => (input as HTMLInputElement).form?.querySelector('button[type="submit"]')
const board = [
  { id: 'todo', label: 'To do', category: 'todo' as const },
  { id: 'doing', label: 'In progress', category: 'inProgress' as const },
  { id: 'done', label: 'Done', category: 'done' as const },
]

describe('project sheets check as you fix (UX Phase 4)', () => {
  it('New project: the name error leaves when a name is typed; a missing start shows under Start', () => {
    render(<ProjectSheet workspaceId="ws-eng" takenKeys={[]} onClose={() => {}} onSaved={() => {}} />)
    const name = screen.getByRole('textbox', { name: /^Name/ })
    expect(screen.queryByText('Give the project a name.')).toBeNull()
    expect(hasSubmit(name)).toBeTruthy()
    const start = fieldOf('Start')!.querySelector('input')!
    fireEvent.change(start, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save project' }))
    expect(fieldOf('Give the project a name.')?.textContent).toContain('Name')
    expect(fieldOf('Pick a start date.')?.textContent).toContain('Start')
    fireEvent.change(name, { target: { value: 'Atlas' } })
    expect(screen.queryByText('Give the project a name.')).toBeNull()
  })

  it('Column: a missing name shows on Name and leaves once typed; Enter saves', () => {
    mutation.mutate.mockClear()
    render(<ColumnSheet projectId="p-nex" columns={board} onClose={() => {}} />)
    const name = screen.getByRole('textbox', { name: /^Name/ })
    fireEvent.click(screen.getByRole('button', { name: 'Add column' }))
    expect(fieldOf('Name each column.')?.textContent).toContain('Name')
    expect(mutation.mutate).not.toHaveBeenCalled()
    fireEvent.change(name, { target: { value: 'QA' } })
    expect(screen.queryByText('Name each column.')).toBeNull()
    expect(hasSubmit(name)).toBeTruthy()
    fireEvent.submit((name as HTMLInputElement).form!)
    expect(mutation.mutate).toHaveBeenCalledTimes(1)
  })

  it('Deliverable: the title error stays on Title and never moves under Due', () => {
    render(<DeliverableSheet project={project} phases={[phase]} onClose={() => {}} />)
    const title = screen.getByRole('textbox', { name: /^Title/ })
    expect(hasSubmit(title)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add deliverable' }))
    expect(fieldOf('Give the deliverable a title.')?.textContent).toContain('Title')
    fireEvent.change(title, { target: { value: 'Release notes' } })
    expect(screen.queryByText('Give the deliverable a title.')).toBeNull()
  })
})

describe('optional fields say so (UX Phase 4, 4.9)', () => {
  it('New project: Client, About and Links say "Optional"', () => {
    render(<ProjectSheet workspaceId="ws-eng" takenKeys={[]} onClose={() => {}} onSaved={() => {}} />)
    for (const name of ['Client', 'About']) expect(screen.getByText(name).closest('label')?.parentElement?.textContent).toContain('Optional')
    expect(screen.getByRole('group', { name: /^Links/ }).textContent).toContain('Optional')
  })
})

describe('the board says before what counts as done changes (UX Phase 4, 4.10)', () => {
  const four = [...board.slice(0, 2), { id: 'review', label: 'In review', category: 'inProgress' as const }, board[2]!]
  it('changing a column with tasks to Done says how many will count as done', () => {
    render(<ColumnSheet projectId="p-nex" columns={four} column={four[2]} count={3} onClose={() => {}} />)
    expect(screen.queryByText(/will count as done/)).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'Done' }))
    expect(screen.getByText('3 tasks here will count as done.')).toBeTruthy()
  })
  it('deleting a column says so when its tasks move to a column of another type', () => {
    render(<DeleteColumnSheet projectId="p-nex" columns={four} column={four[2]!} count={2} onClose={() => {}} />)
    expect(screen.queryByText(/count as done/)).toBeNull()
    fireEvent.change(screen.getByRole('combobox', { name: 'Move them to' }), { target: { value: 'done' } })
    expect(screen.getByText('2 tasks moved to Done will count as done.')).toBeTruthy()
  })
})

describe('Enter while saving (final review)', () => {
  it('a second Enter while the first save is on its way sends nothing', () => {
    mutation.mutate.mockClear()
    mutation.isPending = true
    render(<DeliverableSheet project={project} phases={[phase]} onClose={() => {}} />)
    const title = screen.getByRole('textbox', { name: /^Title/ }) as HTMLInputElement
    fireEvent.change(title, { target: { value: 'Release notes' } })
    fireEvent.submit(title.form!)
    expect(mutation.mutate).not.toHaveBeenCalled()
    mutation.isPending = false
  })
})

describe('project links for screen readers (UX Phase 5A, 5.9)', () => {
  it('each link’s two boxes have names; a bad address marks that box, so Save puts the caret there when it’s the only error', () => {
    render(<ProjectSheet workspaceId="ws-eng" takenKeys={[]} onClose={() => {}} onSaved={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Link 1 label' }), { target: { value: 'Docs' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Link 1 web address' }), { target: { value: 'docs.spark' } })
    fireEvent.click(screen.getByRole('button', { name: /Create project|Save/ }))
    expect(screen.getByRole('textbox', { name: 'Link 1 web address' }).getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByRole('textbox', { name: 'Link 1 label' }).getAttribute('aria-invalid')).toBe('false')
    expect(screen.getByRole('group', { name: /^Links/, description: 'Links must start with https://.' })).toBeTruthy()
    // The box marked wrong says why too (UX Phase 6, deferred minor #28).
    expect(screen.getByRole('textbox', { name: 'Link 1 web address', description: 'Links must start with https://.' })).toBeTruthy()
  })
})

describe('an untouched sheet doesn’t ask after a change from elsewhere (UX Phase 6, deferred minor #3)', () => {
  const columns = [
    { id: 'todo', label: 'To do', category: 'todo' },
    { id: 'doing', label: 'In progress', category: 'inProgress' },
  ] as BoardColumn[]

  it('Column details: the column renamed in another tab, then ✕, closes', () => {
    const onClose = vi.fn()
    const { rerender } = render(<ColumnSheet projectId="p-nex" columns={columns} column={columns[0]} onClose={onClose} />)
    const renamed = [{ ...columns[0]!, label: 'Ready' }, columns[1]!, { id: 'qa', label: 'QA', category: 'inProgress' }] as BoardColumn[]
    rerender(<ColumnSheet projectId="p-nex" columns={renamed} column={renamed[0]} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Add deliverable: the project’s due date moved elsewhere, then ✕, closes', () => {
    const onClose = vi.fn()
    const { rerender } = render(<DeliverableSheet project={project} phases={[phase]} onClose={onClose} />)
    rerender(<DeliverableSheet project={{ ...project, dueDate: '2026-12-20T00:00:00.000Z', currentPhaseId: 'ph-1' }} phases={[phase]} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Edit project: its status changed elsewhere, then ✕, closes', () => {
    const onClose = vi.fn()
    const live = { ...project, status: 'active', clientName: '', description: '', links: [], startDate: '2026-10-01T00:00:00.000Z', methodology: 'agile' } as unknown as ProjectSummary
    const { rerender } = render(<ProjectSheet workspaceId="ws-eng" project={live} takenKeys={[]} onClose={onClose} onSaved={() => {}} />)
    rerender(<ProjectSheet workspaceId="ws-eng" project={{ ...live, status: 'onHold' } as ProjectSummary} takenKeys={[]} onClose={onClose} onSaved={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

