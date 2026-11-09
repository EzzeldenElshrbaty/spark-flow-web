// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NewChannelDialog } from './NewChannelDialog'
import { NewMessageDialog } from './NewMessageDialog'

// UX Phase 1, 1.2: New channel and New message ask before throwing away what was typed or picked; UX Phase 3 (3.1):
// they are chat dialogs (the sf Modal), not kit sheets.

const mutation = { mutate: vi.fn(), isPending: false, error: null }
vi.mock('@/api/chat', () => ({ useChannels: () => ({ data: [] }), useCreateChannel: () => mutation, useOpenDm: () => mutation }))
vi.mock('@/api/users', () => ({
  useMe: () => ({ data: { id: 'u-1', name: 'Youssef Abdelrahman', title: 'Managing Director' } }),
  useUsers: () => ({ data: [{ id: 'u-3', name: 'Mariam Fathy', title: 'Frontend Engineer', teamIds: [], roleIds: ['member'] }] }),
}))
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

afterEach(cleanup)
const wrap = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>)

describe('chat dialogs ask before discarding', () => {
  it('New channel: untouched Cancel closes; a typed name asks "Discard this new channel?"', () => {
    const onClose = vi.fn()
    wrap(<NewChannelDialog workspaceId="ws-eng" workspaceSlug="engineering" onClose={onClose} />)
    const dialog = screen.getByRole('dialog', { name: 'New channel' })
    expect(dialog.closest('.sf')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByRole('textbox', { name: /^Name/ }), { target: { value: 'qa-team' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Discard this new channel?')).toBeTruthy()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('New message: a picked person asks "Discard this new message?"', () => {
    const onClose = vi.fn()
    wrap(<NewMessageDialog workspaceId="ws-eng" workspaceSlug="engineering" onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: 'New message' }).closest('.sf')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: /Mariam Fathy/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Discard this new message?')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('New channel checks as you fix (UX Phase 4, 4.4)', () => {
  it('the name error shows on Create and leaves once a name is typed; Name is marked required; Enter creates', () => {
    mutation.mutate.mockClear()
    wrap(<NewChannelDialog workspaceId="ws-eng" workspaceSlug="engineering" onClose={() => {}} />)
    const name = screen.getByRole('textbox', { name: /^Name/ }) as HTMLInputElement
    expect(screen.getByText('Name', { selector: 'label' }).textContent).toBe('Name *')
    fireEvent.click(screen.getByRole('button', { name: 'Create channel' }))
    expect(screen.getByText('Give the channel a name.')).toBeTruthy()
    fireEvent.change(name, { target: { value: 'qa' } })
    expect(screen.queryByText('Give the channel a name.')).toBeNull()
    expect(name.form?.querySelector('button[type="submit"]')).toBeTruthy()
    fireEvent.submit(name.form!)
    expect(mutation.mutate).toHaveBeenCalledTimes(1)
  })

  it('a private channel with nobody added ties the error to the People list', () => {
    wrap(<NewChannelDialog workspaceId="ws-eng" workspaceSlug="engineering" onClose={() => {}} />)
    fireEvent.change(screen.getByRole('textbox', { name: /^Name/ }), { target: { value: 'qa' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Private/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Create channel' }))
    const people = screen.getByRole('group', { name: 'People' })
    const error = screen.getByText('Add at least one person.')
    expect(people.getAttribute('aria-describedby')).toBe(error.id)
  })
})
