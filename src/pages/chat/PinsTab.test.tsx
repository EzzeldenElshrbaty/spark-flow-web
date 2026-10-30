// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage, PinnedMessage, User } from '@/api/types'
import { parseBody } from '@/lib/messageBody'
import type { BodyContext } from '@/pages/chat/MessageBody'
import { PinsTab } from '@/pages/chat/PinsTab'

afterEach(cleanup)

const users = [
  { id: 'u-1', name: 'Youssef Abdelrahman' },
  { id: 'u-2', name: 'Nour El-Sayed' },
] as User[]
const ctx: BodyContext = { users, tasks: new Map(), projectKeys: new Set(), ws: 'engineering', workspaceId: 'ws-eng' }
const message = (id: string, content: string): ChatMessage => ({
  id, channelId: 'c-backend', seq: 1, senderId: 'u-2', content, body: parseBody(content), attachments: [], reactions: [], threadCount: 0, lastReplyAt: null,
  linkedTicketKeys: [], mentions: [], editedAt: null, createdAt: '2026-10-27T09:00:00.000Z',
})
const pins: PinnedMessage[] = [
  { message: message('m2', 'Deploys are on Thursdays'), pinnedBy: 'u-1', pinnedAt: '2026-10-28T10:00:00.000Z' },
  { message: message('m1', 'The staging password is in the vault'), pinnedBy: 'u-2', pinnedAt: '2026-10-27T10:00:00.000Z' },
]

const show = (props: Partial<Parameters<typeof PinsTab>[0]> = {}) => {
  const onUnpin = vi.fn(async (_messageId: string) => {})
  render(
    <MemoryRouter>
      <PinsTab pins={pins} ctx={ctx} canUnpin onUnpin={onUnpin} {...props} />
    </MemoryRouter>,
  )
  return onUnpin
}

describe('Pins tab (spec 6.1)', () => {
  it('lists each pinned message with its author, text and who pinned it, newest pin first', () => {
    show()
    const rows = screen.getAllByRole('article')
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(['Nour El-Sayed', 'Nour El-Sayed'])
    expect(rows[0].textContent).toContain('Deploys are on Thursdays')
    expect(rows[0].textContent).toContain('Pinned by Youssef Abdelrahman')
  })

  it('View message opens the message in the channel; Unpin unpins it', async () => {
    const onUnpin = show()
    const first = within(screen.getAllByRole('article')[0])
    expect(first.getByRole('link', { name: 'View message' }).getAttribute('href')).toBe('/w/engineering/c/c-backend?message=m2')
    await act(async () => {
      fireEvent.click(first.getByRole('button', { name: 'Unpin' }))
    })
    expect(onUnpin).toHaveBeenCalledWith('m2')
  })

  it('no Unpin where I can’t post; says so when nothing is pinned', () => {
    show({ canUnpin: false })
    expect(screen.queryByRole('button', { name: 'Unpin' })).toBeNull()
    cleanup()
    show({ pins: [] })
    expect(screen.getByText('Nothing is pinned yet. Pin a message from its ⋯ menu, or press P on it.')).toBeTruthy()
  })
})
