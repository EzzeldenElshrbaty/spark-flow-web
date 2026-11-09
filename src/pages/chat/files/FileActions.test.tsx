// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Attachment, Channel, ChatMessage } from '@/api/types'
import { api } from '@/lib/api'
import { FileActionsProvider, useFileActions } from '@/pages/chat/files/FileActions'

vi.mock('@/lib/useRole', () => ({ useRole: () => ({ persona: { id: 'u-1', roleIds: ['member'], grants: [] } }) }))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const pdf = { id: 'a1', name: 'Scope v3.pdf', title: 'Scope v3.pdf', description: '', uploadedBy: 'u-1', scanStatus: 'clean', deletedAt: null } as Attachment
const channel = (id: string, over: Partial<Channel> = {}) => ({ id, workspaceId: 'ws-eng', kind: 'channel', name: id.replace('c-', ''), isPrivate: false, memberIds: ['u-1', 'u-2'], whoCanPost: 'everyone', archivedAt: null, ...over }) as Channel
const people = [{ id: 'u-1', name: 'Youssef Abdelrahman' }, { id: 'u-2', name: 'Nour El-Sayed' }]

function Buttons({ file = pdf }: { file?: Attachment }) {
  const actions = useFileActions()
  return (
    <>
      <button onClick={() => actions?.edit(file)}>edit</button>
      <button onClick={() => actions?.remove(file)}>delete</button>
      <button onClick={() => actions?.share(file)}>share</button>
      <span data-testid="manage">{String(actions?.mayManage(file))}</span>
      <span data-testid="frozen">{String(actions?.frozen)}</span>
    </>
  )
}

function mount(frozen = false) {
  vi.spyOn(api.chat, 'channels').mockResolvedValue([
    channel('c-backend'),
    channel('c-general'),
    channel('c-ops', { archivedAt: '2026-10-28T10:00:00.000Z' }),
    channel('c-design', { memberIds: ['u-2'] }),
    channel('c-announce', { whoCanPost: 'admins' }),
    channel('c-dm-2', { kind: 'dm', name: null, isPrivate: true }),
  ])
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <FileActionsProvider workspaceId="ws-eng" meId="u-1" people={people} onDetails={vi.fn()} frozen={frozen}>
        <Buttons />
      </FileActionsProvider>
    </QueryClientProvider>,
  )
}

describe('file actions: Edit file details, Delete file and Share (spec 6.9, slice 6)', () => {
  it('whoever uploaded it may manage it', () => {
    mount()
    expect(screen.getByTestId('manage').textContent).toBe('true')
  })

  it('Edit file details changes the name and description, and says what’s wrong near the field', async () => {
    const update = vi.spyOn(api.files, 'update').mockResolvedValue({ ...pdf, title: 'Release scope' })
    mount()
    fireEvent.click(screen.getByText('edit'))
    const dialog = within(screen.getByRole('dialog', { name: 'Edit file details' }))
    const name = dialog.getByRole('textbox', { name: 'Name' })
    fireEvent.change(name, { target: { value: ' ' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }))
    expect(dialog.getByRole('alert').textContent).toBe('Give the file a name.')
    expect(update).not.toHaveBeenCalled()
    fireEvent.change(name, { target: { value: 'Release scope' } })
    fireEvent.change(dialog.getByRole('textbox', { name: 'Description' }), { target: { value: 'What ships in 2.4.' } })
    await act(async () => fireEvent.click(dialog.getByRole('button', { name: 'Save' })))
    expect(update).toHaveBeenCalledWith('a1', { title: 'Release scope', description: 'What ships in 2.4.' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Delete file asks first, naming the file and what it means; a refusal shows in the question', async () => {
    const remove = vi.spyOn(api.files, 'delete').mockRejectedValueOnce(new Error('This channel is archived.')).mockResolvedValue()
    mount()
    fireEvent.click(screen.getByText('delete'))
    const ask = screen.getByRole('dialog', { name: 'Delete Scope v3.pdf?' })
    // A delete is a danger confirm, not a primary one (UX Phase 3).
    expect(within(ask).getByRole('button', { name: 'Delete' }).className).toContain('bg-sf-danger-fill')
    expect(screen.getByRole('dialog', { description: "It’s removed from every message it’s shared in, for everyone." })).toBe(ask)
    await act(async () => fireEvent.click(within(ask).getByRole('button', { name: 'Delete' })))
    expect(within(ask).getByRole('alert').textContent).toBe('This channel is archived.')
    await act(async () => fireEvent.click(within(ask).getByRole('button', { name: 'Delete' })))
    expect(remove).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Share offers the channels and DMs I can post in, narrows them as I type, and posts there with my message', async () => {
    const share = vi.spyOn(api.files, 'share').mockResolvedValue({ id: 'm9' } as ChatMessage)
    mount()
    fireEvent.click(screen.getByText('share'))
    const dialog = within(screen.getByRole('dialog', { name: 'Share Scope v3.pdf' }))
    await vi.waitFor(() => expect(dialog.getAllByRole('radio')).toHaveLength(3))
    expect(dialog.getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual(['#backend', '#general', 'Nour El-Sayed'])
    expect((dialog.getByRole('button', { name: 'Share' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(dialog.getByRole('searchbox', { name: 'Find a channel or person' }), { target: { value: 'gen' } })
    expect(dialog.getAllByRole('radio')).toHaveLength(1)
    fireEvent.click(dialog.getByRole('radio', { name: '#general' }))
    fireEvent.change(dialog.getByRole('textbox', { name: 'Add a message (optional)' }), { target: { value: 'For everyone' } })
    await act(async () => fireEvent.click(dialog.getByRole('button', { name: 'Share' })))
    expect(share).toHaveBeenCalledWith('a1', 'c-general', 'For everyone')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('file actions in an archived place (slice 6 review)', () => {
  it('tells the cards the channel is archived, so they leave out Edit and Delete', () => {
    mount(true)
    expect(screen.getByTestId('frozen').textContent).toBe('true')
    cleanup()
    mount()
    expect(screen.getByTestId('frozen').textContent).toBe('false')
  })
})

describe('Delete file: where focus goes (slice 6 review)', () => {
  it('when the card that opened it is gone, focus goes to its message’s focus stop', async () => {
    let gone: () => void = () => {}
    vi.spyOn(api.files, 'delete').mockImplementation(async () => gone())
    function Row() {
      const actions = useFileActions()
      const [shown, setShown] = useState(true)
      gone = () => setShown(false)
      return (
        <div role="log" tabIndex={0}>
          <article>
            <button data-row-focus="">More actions</button>
            {shown && <button onClick={() => actions?.remove(pdf)}>delete</button>}
          </article>
        </div>
      )
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FileActionsProvider workspaceId="ws-eng" meId="u-1" people={people} onDetails={vi.fn()}>
          <Row />
        </FileActionsProvider>
      </QueryClientProvider>,
    )
    screen.getByText('delete').focus()
    fireEvent.click(screen.getByText('delete'))
    await act(async () => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' })))
    await act(() => new Promise((r) => setTimeout(r, 20)))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More actions' }))
  })
})
