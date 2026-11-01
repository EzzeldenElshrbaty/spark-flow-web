import '@/index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import type { Channel } from '@/api/types'
import { api } from '@/lib/api'
import { bodyText, type Body } from '@/lib/messageBody'
import { ThreadComposer } from '@/pages/chat/ThreadComposer'

// The rich composer needs a real editor, so this runs in Chromium.

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const channel: Channel = {
  id: 'c-backend', workspaceId: 'ws-eng', kind: 'channel', name: 'backend', topic: '', memberIds: ['u-1'], isPrivate: false, lastMessageAt: null, description: '', whoCanPost: 'everyone', isDefault: false,
  unreadCount: 0, lastSeq: 9, lastReadSeq: 9, starred: false, muted: false, notifyLevel: 'all', notifyLevelOwn: false,
}

async function mount() {
  vi.spyOn(api.chat, 'drafts').mockResolvedValue([])
  vi.spyOn(api.chat, 'saveDraft').mockResolvedValue(null)
  const onSend = vi.fn(async (_body: Body, _also: boolean) => {})
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <div className="sf" style={{ width: 384 }}>
          <ThreadComposer channel={channel} rootId="m1" sendTo="#backend" onSend={onSend} />
        </div>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  const editor = await screen.findByRole('textbox', { name: 'Reply in the thread' })
  await vi.waitFor(() => expect(editor.getAttribute('data-lexical-editor')).toBe('true'))
  return { onSend, editor }
}

describe('the thread composer (spec 6.7)', () => {
  it('is the rich composer, its formatting row hidden until Aa', async () => {
    await mount()
    expect(screen.queryByRole('toolbar', { name: 'Formatting' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Show formatting' })).toBeTruthy()
  })

  it('offers Also send to #backend, unchecked; sent with it, the box clears and it’s unchecked again', async () => {
    const { onSend, editor } = await mount()
    const also = screen.getByRole('checkbox', { name: 'Also send to #backend' })
    expect((also as HTMLInputElement).checked).toBe(false)
    // As a person does: the box is drawn, the input itself is out of sight.
    await userEvent.click(screen.getByText('Also send to #backend'))
    expect((also as HTMLInputElement).checked).toBe(true)
    await userEvent.click(editor)
    await userEvent.keyboard('Shipped{Enter}')
    await vi.waitFor(() => expect(onSend).toHaveBeenCalledOnce())
    expect(bodyText(onSend.mock.calls[0][0])).toBe('Shipped')
    expect(onSend.mock.calls[0][1]).toBe(true)
    await vi.waitFor(() => expect((screen.getByRole('checkbox', { name: 'Also send to #backend' }) as HTMLInputElement).checked).toBe(false))
  })

  it('without it, only the thread gets the reply', async () => {
    const { onSend, editor } = await mount()
    await userEvent.click(editor)
    await userEvent.keyboard('Thanks{Enter}')
    await vi.waitFor(() => expect(onSend).toHaveBeenCalledWith(expect.anything(), false, []))
  })

  it('saves a draft per thread', async () => {
    const { editor } = await mount()
    await userEvent.click(editor)
    await userEvent.keyboard('half a thought')
    await vi.waitFor(() => expect(api.chat.saveDraft).toHaveBeenCalledWith('c-backend', expect.anything(), 'm1'), { timeout: 2000 })
  })
})
