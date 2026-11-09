// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Team } from '@/api/types'
import { TeamsPage } from './TeamsPage'

// UX Phase 2, 2.4: whoever may change settings makes, renames and removes teams on the Teams page.

let manages = true
let teams: Team[] = []
const create = vi.fn(async (_input: unknown) => ({}))
const rename = vi.fn(async (_input: unknown) => ({}))
const remove = vi.fn(async (_id: string) => {})
vi.mock('@/layout/useCurrentWorkspace', () => ({ useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' } }) }))
vi.mock('@/lib/usePermission', () => ({ usePermission: () => (action: string) => manages && action === 'settings.manage' }))
vi.mock('@/api/chat', () => ({ useOpenDm: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/api/users', () => ({ useMe: () => ({ data: { id: 'u-1' } }), useUsers: () => ({ data: [{ id: 'u-5', name: 'Salma Ibrahim', title: 'QA Engineer', teamIds: ['t-qa'] }] }) }))
vi.mock('@/api/projects', () => ({
  useTeams: () => ({ data: teams, isPending: false, isError: false }),
  useProjectSummaries: () => ({ data: [] }),
  useCreateTeam: () => ({ mutate: (input: unknown, opts?: { onSuccess?: () => void }) => void create(input).then(() => opts?.onSuccess?.()), isPending: false, error: null }),
  useRenameTeam: () => ({ mutate: (input: unknown, opts?: { onSuccess?: () => void }) => void rename(input).then(() => opts?.onSuccess?.()), isPending: false, error: null }),
  useRemoveTeam: () => ({ mutateAsync: remove }),
}))
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

beforeEach(() => {
  manages = true
  teams = [{ id: 't-qa', workspaceId: 'ws-eng', name: 'QA', memberIds: ['u-5'] }]
  create.mockClear()
  rename.mockClear()
  remove.mockReset()
})
afterEach(cleanup)

const show = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <TeamsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )

describe('Teams page (UX Phase 2, 2.4)', () => {
  it('New team asks before throwing away a typed name, and makes the team', async () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'New team' }))
    const sheet = screen.getByRole('dialog', { name: 'New team' })
    fireEvent.change(within(sheet).getByRole('textbox', { name: /^Name/ }), { target: { value: 'Data' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }))
    expect(within(sheet).getByText('Discard this new team?')).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Keep editing' }))
    await act(async () => fireEvent.click(within(sheet).getByRole('button', { name: 'Add team' })))
    expect(create).toHaveBeenCalledWith({ workspaceId: 'ws-eng', name: 'Data' })
  })

  it('each team’s ⋯ renames it or removes it, and a refusal shows in the sheet', async () => {
    remove.mockRejectedValueOnce(new Error('Take QA off Nexus Core first.'))
    show()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'QA actions' })))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent?.trim())).toEqual(['Rename', 'Remove'])
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' })))
    const sheet = screen.getByRole('dialog', { name: 'Remove QA?' })
    await act(async () => fireEvent.click(within(sheet).getByRole('button', { name: 'Remove team' })))
    expect(remove).toHaveBeenCalledWith('t-qa')
    await waitFor(() => expect(within(sheet).getByText('Take QA off Nexus Core first.')).toBeTruthy())
  })

  it('without the right to change settings: no New team, no ⋯', () => {
    manages = false
    show()
    expect(screen.queryByRole('button', { name: 'New team' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'QA actions' })).toBeNull()
  })
})

describe('a team member’s Message (UX Phase 4, 4.10)', () => {
  it('is an icon button named and titled for the person', () => {
    show()
    const message = screen.getByRole('button', { name: 'Message Salma Ibrahim' })
    expect(message.getAttribute('title')).toBe('Message Salma Ibrahim')
    expect(message.textContent).toBe('')
  })
})
