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
