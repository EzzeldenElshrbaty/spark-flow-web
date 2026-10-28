import '@/index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import type { Channel, ChatMessage, TaskRef, User } from '@/api/types'
import { ToastProvider } from '@/components/sf/Toast'
import { Logo } from '@/layout/Sidebar'
import { UserMenu } from '@/layout/UserMenu'
import { WorkspaceSwitcher } from '@/layout/WorkspaceSwitcher'
import { ThemeProvider } from '@/lib/ThemeProvider'
import { parseBody } from '@/lib/messageBody'
import { ChannelHeader } from '@/pages/chat/ChannelHeader'
import { ChannelMessage } from '@/pages/chat/ChannelMessage'
import { ChannelTabs } from '@/pages/chat/ChannelTabs'
import { RichComposer } from '@/pages/chat/composer/RichComposer'
import { EmojiPicker } from '@/pages/chat/EmojiPicker'
import { useEditing } from '@/pages/chat/editingStore'
import { MarkAllReadModal } from '@/pages/chat/ChannelShortcuts'
import type { BodyContext } from '@/pages/chat/MessageBody'

// Spec 10: every text and control pair meets the 3.2 contrast, checked automatically in CI. These render the chat's
// surfaces in both themes with the app's CSS and run axe over the page (portals included).

afterEach(cleanup)

const users = [
  { id: 'u-1', name: 'Youssef Abdelrahman', title: 'Managing Director', email: 'y@spark-sys.com', presence: 'active', role: 'admin' },
  { id: 'u-2', name: 'Nour El-Sayed', title: 'Backend lead', email: 'n@spark-sys.com', presence: 'away', role: 'pm' },
] as User[]
const task: TaskRef = { key: 'NEX-103', title: 'Rate limit the search API', status: 'inReview', statusLabel: 'In review', category: 'inProgress', projectKey: 'NEX', projectName: 'Nexus Core', assigneeId: 'u-2' }
const ctx: BodyContext = { users, tasks: new Map([[task.key, task]]), projectKeys: new Set(['NEX']), ws: 'engineering', workspaceId: 'ws-eng' }
const channel: Channel = {
  id: 'c-backend', workspaceId: 'ws-eng', kind: 'channel', name: 'backend', topic: 'APIs and jobs', memberIds: ['u-1', 'u-2'], isPrivate: false, lastMessageAt: null,
  unreadCount: 0, lastSeq: 9, lastReadSeq: 9, starred: true, muted: false, notifyLevel: 'all',
}
let n = 0
const message = (content: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `m${++n}`, channelId: 'c-backend', seq: n, senderId: 'u-2', content, body: parseBody(content), attachments: [], reactions: [], threadCount: 0, lastReplyAt: null,
  linkedTicketKeys: [], mentions: [], editedAt: null, createdAt: '2026-10-28T09:00:00.000Z', ...over,
})
const directory = { users, projects: [{ key: 'NEX', name: 'Nexus Core' }], tasks: [{ key: 'NEX-103', title: task.title }], channels: [{ id: 'c-backend', name: 'backend' }], memberIds: ['u-1'] }

function mount(node: ReactNode, dark: boolean) {
  document.documentElement.classList.toggle('dark', dark)
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter>
          <main className={`sf bg-sf-surface p-4 ${dark ? 'dark' : ''}`} style={{ width: 760 }}>
            {/* As in the app, where the channel's name is the page's h1. */}
            <h1 className="sr-only">#backend</h1>
            {node}
          </main>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

/** Runs axe over the whole page; `region` is about page landmarks, which a lone component can't have. */
async function violations() {
  const result = await axe.run(document, { rules: { region: { enabled: false } } })
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((node) => node.target.join(' ')).join(', ')}`)
}

const surfaces: [string, () => ReactNode][] = [
  [
    'channel header and tabs',
    () => (
      <>
        <ChannelHeader channel={channel} title="backend" members={users} rights={{ manage: true, leave: true }} onEdit={vi.fn()} onStar={vi.fn()} onMute={vi.fn()} onMarkRead={vi.fn()} onCopyLink={async () => {}} onLeave={vi.fn()} onArchive={vi.fn()} />
        <ChannelTabs channel={channel} tab="messages" onChange={vi.fn()} panelId="p" />
        <div id="p" role="tabpanel" aria-label="Messages" />
      </>
    ),
  ],
  [
    'messages in every state',
    () => (
      <ol>
        {[
          message('*Ship* NEX-103 with `code` and https://spark-sys.com', { reactions: [{ emoji: '👍', userIds: ['u-1', 'u-2'] }], threadCount: 2, lastReplyAt: '2026-10-28T09:05:00.000Z', replyUserIds: ['u-1'] }),
          message('@all heads up', { mentions: [{ kind: 'all', id: 'all' }], editedAt: '2026-10-28T09:01:00.000Z' }),
          message('', { deletedAt: 'T', body: [], threadCount: 1 }),
          message('', { system: { kind: 'renamed', from: 'api', to: 'backend' } }),
          message('Bug on NEX-103: fails on retry', { commentId: 'k1', linkedTicketKeys: ['NEX-103'] }),
        ].map((m) => (
          <li key={m.id}>
            <ChannelMessage message={m} users={users} ctx={ctx} meId="u-1" canPost continuation={false} />
          </li>
        ))}
        <li>
          <ChannelMessage message={message('not yet', { senderId: 'u-1' })} users={users} ctx={ctx} meId="u-1" canPost continuation={false} sendState="failed" sendError="Refused." onRetry={vi.fn()} onDiscard={vi.fn()} />
        </li>
      </ol>
    ),
  ],
  ['emoji picker', () => <EmojiPicker onPick={vi.fn()} />],
  ['composer', () => <RichComposer placeholder="Message #backend" onSend={async () => {}} directory={directory} />],
  ['composer editing a message', () => <RichComposer mode="edit" placeholder="Edit message" initialBody={parseBody('fix *this*')} onSend={async () => {}} onCancel={vi.fn()} directory={directory} />],
]

describe.each([
  ['light', false],
  ['dark', true],
])('accessibility in %s (spec 10, 3.2 contrast)', (_theme, dark) => {
  it.each(surfaces)('%s has no axe violations', async (_name, node) => {
    mount(node(), dark)
    await new Promise((r) => setTimeout(r, 50))
    expect(await violations()).toEqual([])
  })

  it('the open channel menu has no axe violations', async () => {
    mount(surfaces[0][1](), dark)
    await userEvent.click(screen.getByRole('button', { name: 'Channel actions' }))
    expect(await violations()).toEqual([])
  })

  it('the Mark everything read question (Shift+Esc) and a message menu with Mark unread have no axe violations', async () => {
    mount(<MarkAllReadModal channels={[channel, { ...channel, id: 'c-2' }]} onClose={vi.fn()} />, dark)
    expect(await violations()).toEqual([])
    cleanup()
    mount(<ChannelMessage message={message('hi')} users={users} ctx={ctx} meId="u-1" canPost continuation={false} onMarkUnread={async () => {}} />, dark)
    await userEvent.click(screen.getByRole('button', { name: 'Message actions', hidden: true }))
    expect(screen.getByRole('menuitem', { name: 'Mark unread' })).toBeTruthy()
    expect(await violations()).toEqual([])
  })

  it('an open profile card has no axe violations', async () => {
    mount(<ChannelMessage message={message('hi')} users={users} ctx={ctx} meId="u-1" canPost continuation={false} />, dark)
    await userEvent.click(screen.getByRole('button', { name: 'Nour El-Sayed' }))
    expect(await violations()).toEqual([])
  })

  it('the open mention list has no axe violations', async () => {
    mount(surfaces[3][1](), dark)
    const editor = screen.getByRole('textbox', { name: 'Message #backend' })
    await vi.waitFor(() => expect(editor.getAttribute('data-lexical-editor')).toBe('true'))
    await userEvent.click(editor)
    await userEvent.keyboard('@no')
    await screen.findByRole('listbox', { name: 'Mention someone' }, { timeout: 3000 })
    expect(await violations()).toEqual([])
  })
})

describe('composer autocomplete semantics (spec 10)', () => {
  const editor = async () => {
    mount(surfaces[3][1](), false)
    const box = screen.getByRole('textbox', { name: 'Message #backend' })
    await vi.waitFor(() => expect(box.getAttribute('data-lexical-editor')).toBe('true'))
    return box
  }

  it('the message box says a suggestion list can appear', async () => {
    expect((await editor()).getAttribute('aria-autocomplete')).toBe('list')
  })

  it('a mention query that matches no one leaves no empty list behind', async () => {
    await userEvent.click(await editor())
    await userEvent.keyboard('@zzzz')
    await new Promise((r) => setTimeout(r, 300))
    expect(await violations()).toEqual([])
  })
})

describe('message actions on a phone (spec 10: every screen works at 390px)', () => {
  const wrapperOpacity = () => getComputedStyle(screen.getByRole('button', { name: 'Message actions', hidden: true }).closest('div.absolute')!).opacity

  it('the ⋯ menu is always shown on a phone, where there is no hover', async () => {
    await page.viewport(390, 844)
    try {
      mount(<ChannelMessage message={message('hi')} users={users} ctx={ctx} meId="u-1" canPost continuation={false} />, false)
      expect(wrapperOpacity()).toBe('1')
    } finally {
      await page.viewport(414, 896)
    }
  })

  it('on a wider screen it waits for hover or focus', async () => {
    await page.viewport(1280, 800)
    try {
      mount(<ChannelMessage message={message('hi')} users={users} ctx={ctx} meId="u-1" canPost continuation={false} />, false)
      expect(wrapperOpacity()).toBe('0')
    } finally {
      await page.viewport(414, 896)
    }
  })
})

describe('focus around reactions (spec 10)', () => {
  it('closing the add-reaction picker puts focus back on its chip', async () => {
    mount(<ChannelMessage message={message('hi', { reactions: [{ emoji: '👍', userIds: ['u-2'] }] })} users={users} ctx={ctx} meId="u-1" canPost continuation={false} />, false)
    // As from the keyboard: focus in the message shows the chip.
    screen.getByRole('button', { name: '👍 1: Nour El-Sayed' }).focus()
    const chip = await screen.findByRole('button', { name: 'Add reaction' })
    chip.focus()
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('dialog', { name: 'Add reaction' })
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(document.activeElement).toBe(chip))
  })
})

describe('focus when an edit ends (spec 10)', () => {
  const editBox = async () => {
    const box = await screen.findByRole('textbox', { name: 'Edit message' }, { timeout: 3000 })
    await vi.waitFor(() => expect(box.getAttribute('data-lexical-editor')).toBe('true'))
    await vi.waitFor(() => expect(document.activeElement).toBe(box))
    return box
  }

  it("Escape puts focus back on the message's actions button", async () => {
    const mine = message('fix this', { senderId: 'u-1' })
    mount(<ChannelMessage message={mine} users={users} ctx={ctx} meId="u-1" canPost continuation={false} />, false)
    screen.getByRole('button', { name: 'Message actions' }).focus()
    await userEvent.keyboard('e')
    await editBox()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Message actions' })))
  })

  it('an edit started from the message box (Up) goes back to it', async () => {
    const mine = message('fix this', { senderId: 'u-1' })
    mount(
      <>
        <ChannelMessage message={mine} users={users} ctx={ctx} meId="u-1" canPost continuation={false} />
        <input aria-label="Message #backend" />
      </>,
      false,
    )
    const composer = screen.getByRole('textbox', { name: 'Message #backend' })
    composer.focus()
    act(() => useEditing.getState().start(mine.id))
    await editBox()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await vi.waitFor(() => expect(document.activeElement).toBe(composer))
  })
})

describe('the shell around the chat (spec 10)', () => {
  it('the logo, workspace switcher and account menu are named by what they show', async () => {
    // Wide enough for the account button to show the name and title.
    await page.viewport(1280, 800)
    mount(
      <ThemeProvider>
        {/* The logo sits on the sidebar's dark frame. */}
        <div className="bg-sf-app-frame p-2">
          <Logo />
        </div>
        <WorkspaceSwitcher />
        <UserMenu />
      </ThemeProvider>,
      false,
    )
    // Loaded: no placeholders left.
    await vi.waitFor(() => expect(document.querySelector('.animate-pulse')).toBeNull(), { timeout: 3000 })
    try {
      expect(await violations()).toEqual([])
    } finally {
      await page.viewport(414, 896)
    }
  })
})

