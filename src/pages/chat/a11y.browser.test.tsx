import '@/index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import type { ActivityItem, Channel, ChatMessage, TaskRef, User } from '@/api/types'
import { ToastProvider } from '@/components/sf/Toast'
import { api } from '@/lib/api'
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
import { ActivityView } from '@/pages/chat/ActivityView'
import { ChannelDetails } from '@/pages/chat/ChannelDetails'
import { ThreadMenu } from '@/pages/chat/ThreadMenu'
import { ThreadComposer } from '@/pages/chat/ThreadComposer'
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
  id: 'c-backend', workspaceId: 'ws-eng', kind: 'channel', name: 'backend', topic: 'APIs and jobs', memberIds: ['u-1', 'u-2'], isPrivate: false, lastMessageAt: null, description: '', whoCanPost: 'everyone',
  unreadCount: 0, lastSeq: 9, lastReadSeq: 9, starred: true, muted: false, notifyLevel: 'mentions',
}
let n = 0
const message = (content: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `m${++n}`, channelId: 'c-backend', seq: n, senderId: 'u-2', content, body: parseBody(content), attachments: [], reactions: [], threadCount: 0, lastReplyAt: null,
  linkedTicketKeys: [], mentions: [], editedAt: null, createdAt: '2026-10-28T09:00:00.000Z', ...over,
})
const activity: ActivityItem[] = [
  { id: 'a1', kind: 'mention', read: false, createdAt: '2026-10-28T09:00:00.000Z', workspaceId: 'ws-eng', actorId: 'u-2', actorName: 'Nour El-Sayed', channelId: 'c-backend', messageId: 'm1', replyId: null, taskKey: null, projectId: null, excerpt: 'Can you review NEX-103 today?', emoji: null },
  { id: 'a2', kind: 'reaction', read: true, createdAt: '2026-10-28T08:00:00.000Z', workspaceId: 'ws-eng', actorId: 'u-2', actorName: 'Nour El-Sayed', channelId: 'c-backend', messageId: 'm2', replyId: null, taskKey: null, projectId: null, excerpt: 'Shipped the fix', emoji: '👍' },
]
const details = (over: Partial<Parameters<typeof ChannelDetails>[0]> = {}) => (
  <ChannelDetails
    channel={channel}
    meId="u-1"
    people={users}
    takenNames={[]}
    project={null}
    rights={{ manage: true, leave: true, restrictPosting: true }}
    tab="about"
    onClose={vi.fn()}
    onSave={async () => {}}
    onAdd={async () => {}}
    onRemove={async () => {}}
    onStar={vi.fn()}
    onNotifyLevel={vi.fn()}
    onMute={vi.fn()}
    onCopyLink={async () => {}}
    onLeave={vi.fn()}
    onArchive={vi.fn()}
    {...over}
  />
)
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
        <ChannelHeader channel={channel} title="backend" members={users} rights={{ manage: true, leave: true }} onDetails={vi.fn()} onStar={vi.fn()} onMute={vi.fn()} onNotifyLevel={vi.fn()} onMarkRead={vi.fn()} onCopyLink={async () => {}} onLeave={vi.fn()} onArchive={vi.fn()} />
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

  it('the open notifications bell menu has no axe violations (spec 6.11)', async () => {
    mount(surfaces[0][1](), dark)
    await userEvent.click(screen.getByRole('button', { name: 'Channel notifications' }))
    expect(screen.getByRole('menuitemradio', { name: 'Mentions and keywords' })).toBeTruthy()
    expect(await violations()).toEqual([])
  })

  it('the Mark everything read question (Shift+Esc) and a message menu with Mark unread have no axe violations', async () => {
    mount(<MarkAllReadModal channels={[channel, { ...channel, id: 'c-2' }]} onClose={vi.fn()} />, dark)
    expect(await violations()).toEqual([])
    cleanup()
    mount(<ChannelMessage message={message('hi')} users={users} ctx={ctx} meId="u-1" canPost continuation={false} onMarkUnread={async () => {}} />, dark)
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.getByRole('menuitem', { name: 'Mark unread' })).toBeTruthy()
    expect(await violations()).toEqual([])
  })

  it('the message toolbar and its open menu have no axe violations (a wider screen)', async () => {
    await page.viewport(1280, 800)
    try {
      mount(<ChannelMessage message={message('hi')} users={users} ctx={ctx} meId="u-1" canPost continuation={false} onMarkUnread={async () => {}} />, dark)
      await userEvent.hover(screen.getByRole('article'))
      expect(screen.getByRole('toolbar', { name: 'Message actions' })).toBeTruthy()
      expect(await violations()).toEqual([])
      await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
      expect(screen.getByRole('menuitem', { name: 'Copy text' })).toBeTruthy()
      expect(await violations()).toEqual([])
    } finally {
      await page.viewport(414, 896)
    }
  })

  it('the thread panel’s open ⋮ menu has no axe violations', async () => {
    mount(<ThreadMenu messageId="m1" following={false} link="https://flow.example/w/engineering/c/c-backend?thread=m1" />, dark)
    await userEvent.click(screen.getByRole('button', { name: 'Thread actions' }))
    expect(screen.getByRole('menuitem', { name: 'Get notified about replies' })).toBeTruthy()
    expect(await violations()).toEqual([])
  })

  it('the thread composer, with Also send, has no axe violations', async () => {
    mount(<ThreadComposer channel={channel} rootId="m1" sendTo="#backend" onSend={async () => {}} />, dark)
    await screen.findByRole('textbox', { name: 'Reply in the thread' }, { timeout: 3000 })
    expect(await violations()).toEqual([])
  })

  it('a reply also sent to the channel, as the channel shows it, has no axe violations', async () => {
    mount(<ChannelMessage message={message('Posted them', { broadcast: { rootId: 'm0', rootText: 'Release notes for 2.4?' } })} users={users} ctx={ctx} meId="u-1" canPost continuation={false} />, dark)
    expect(await violations()).toEqual([])
  })

  it('an open profile card has no axe violations', async () => {
    mount(<ChannelMessage message={message('hi')} users={users} ctx={ctx} meId="u-1" canPost continuation={false} />, dark)
    await userEvent.click(screen.getByRole('button', { name: 'Nour El-Sayed' }))
    expect(await violations()).toEqual([])
  })

  it('Activity, its rows read and unread and its error, has no axe violations (spec 6.12)', async () => {
    mount(<ActivityView items={activity} ws="engineering" placeOf={() => '#backend'} error={false} retrying={false} onRetry={vi.fn()} onOpen={vi.fn()} onMarkAllRead={vi.fn()} marking={false} markError="Couldn’t mark them read. Try again." />, dark)
    expect(screen.getByRole('heading', { name: 'Earlier' })).toBeTruthy()
    expect(await violations()).toEqual([])
  })

  it('Channel details on each tab, with a field open, its level menu and Add people, has no axe violations (spec 6.10)', async () => {
    mount(details({ editTopic: true }), dark)
    expect(screen.getByRole('textbox', { name: 'Topic' })).toBeTruthy()
    expect(await violations()).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: 'Channel notifications: Mentions and keywords' }))
    expect(screen.getByRole('menuitemradio', { name: 'Nothing' })).toBeTruthy()
    expect(await violations()).toEqual([])
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('tab', { name: 'Members 2' }))
    expect(await violations()).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: 'Add people' }))
    expect(screen.getByRole('dialog', { name: 'Add people to #backend' })).toBeTruthy()
    expect(await violations()).toEqual([])
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('tab', { name: 'Settings' }))
    expect(screen.getByRole('radiogroup', { name: 'Who can post' })).toBeTruthy()
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

describe('the message toolbar (spec 6.4) and the ⋯ on a phone (spec 10: every screen works at 390px)', () => {
  const opacity = (el: Element) => getComputedStyle(el).opacity

  it('a phone has no toolbar: the ⋯ is always shown, where there is no hover', async () => {
    await page.viewport(390, 844)
    try {
      mount(<ChannelMessage message={message('hi')} users={users} ctx={ctx} meId="u-1" canPost continuation={false} />, false)
      expect(screen.queryByRole('toolbar')).toBeNull()
      expect(opacity(screen.getByRole('button', { name: 'More actions' }).closest('div.absolute')!)).toBe('1')
    } finally {
      await page.viewport(414, 896)
    }
  })

  it('on a phone the ⋯ answers a 44px touch (spec 6.16), though it shows at 32px', async () => {
    await page.viewport(390, 844)
    try {
      mount(
        <div style={{ width: 350 }}>
          <ChannelMessage message={message('hi')} users={users} ctx={ctx} meId="u-1" canPost continuation={false} />
        </div>,
        false,
      )
      const more = screen.getByRole('button', { name: 'More actions' })
      const r = more.getBoundingClientRect()
      const hit = (x: number, y: number) => document.elementFromPoint(x, y)?.closest('button') === more
      const mid = { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      expect([hit(r.left - 5, mid.y), hit(r.right + 5, mid.y), hit(mid.x, r.top - 5), hit(mid.x, r.bottom + 5)]).toEqual([true, true, true, true])
    } finally {
      await page.viewport(414, 896)
    }
  })

  it('it keeps clear of a bar laid over the list (the unread bar)', async () => {
    await page.viewport(1280, 800)
    try {
      mount(
        <div className="relative">
          <div role="log" aria-label="Messages" style={{ height: 300, overflowY: 'auto' }}>
            <ChannelMessage message={message('first')} users={users} ctx={ctx} meId="u-1" canPost continuation={false} />
          </div>
          <div data-list-overlay="" className="absolute inset-x-0 top-0 z-10 h-10 bg-sf-accent-fill" />
        </div>,
        false,
      )
      const overlay = document.querySelector('[data-list-overlay]')!.getBoundingClientRect()
      // From the keyboard: the bar lies over where a pointer would reach the row's top.
      await userEvent.tab()
      expect(screen.getByRole('article').contains(document.activeElement)).toBe(true)
      await vi.waitFor(() => expect(screen.getByRole('toolbar').getBoundingClientRect().top).toBeGreaterThanOrEqual(overlay.bottom))
    } finally {
      await page.viewport(414, 896)
    }
  })

  it('on a wider screen it waits for hover or focus, and stays while its menu is open', async () => {
    await page.viewport(1280, 800)
    try {
      mount(<ChannelMessage message={message('hi')} users={users} ctx={ctx} meId="u-1" canPost continuation={false} />, false)
      const toolbar = screen.getByRole('toolbar', { name: 'Message actions' })
      expect(opacity(toolbar)).toBe('0')
      await userEvent.hover(screen.getByRole('article'))
      await vi.waitFor(() => expect(opacity(toolbar)).toBe('1'))
      await userEvent.click(screen.getByRole('button', { name: 'More actions' }))
      await userEvent.unhover(screen.getByRole('article'))
      expect(opacity(toolbar)).toBe('1')
    } finally {
      await page.viewport(414, 896)
    }
  })

  it('keyboard focus in the row shows it', async () => {
    await page.viewport(1280, 800)
    try {
      mount(<ChannelMessage message={message('hi')} users={users} ctx={ctx} meId="u-1" canPost continuation={false} />, false)
      const toolbar = screen.getByRole('toolbar', { name: 'Message actions' })
      await userEvent.tab()
      expect(screen.getByRole('article').contains(document.activeElement)).toBe(true)
      await vi.waitFor(() => expect(opacity(toolbar)).toBe('1'))
    } finally {
      await page.viewport(414, 896)
    }
  })

  it('a mouse click doesn’t keep a row’s toolbar showing once the pointer moves on', async () => {
    await page.viewport(1280, 800)
    vi.spyOn(api.chat, 'react').mockResolvedValue()
    try {
      mount(
        <>
          <ChannelMessage message={message('first')} users={users} ctx={ctx} meId="u-1" canPost continuation={false} />
          <ChannelMessage message={message('second')} users={users} ctx={ctx} meId="u-1" canPost continuation={false} />
        </>,
        false,
      )
      const [first, second] = screen.getAllByRole('article')
      const [bar] = screen.getAllByRole('toolbar', { name: 'Message actions' })
      await userEvent.hover(first)
      await userEvent.click(within(first).getByRole('button', { name: 'React with ✅' }))
      await userEvent.hover(second)
      await vi.waitFor(() => expect(opacity(bar)).toBe('0'))
    } finally {
      vi.restoreAllMocks()
      await page.viewport(414, 896)
    }
  })

  it('in the thread panel (384px) it never covers the author name or the time', async () => {
    await page.viewport(1280, 800)
    const people = [...users, { id: 'u-3', name: 'Abdelrahman Mostafa Elshazly', title: 'QA lead', email: 'a@spark-sys.com', presence: 'active', role: 'member' } as User]
    const wide = { ...ctx, users: people }
    const row = (content: string, over: Partial<ChatMessage> = {}) => (
      <ChannelMessage message={message(content, { senderId: 'u-3', ...over })} users={people} ctx={wide} meId="u-1" canPost continuation={false} showThread={false} compact />
    )
    try {
      mount(
        // As the panel lays them out: the root at the top, its replies under the count.
        <div role="log" aria-label="Thread" className="px-5 py-4" style={{ width: 384, height: 500, overflowY: 'auto' }}>
          <div className="-mx-3">{row('the root message')}</div>
          <div style={{ height: 40 }} />
          <ul className="-mx-3">
            <li>{row('a reply')}</li>
            <li>{row('another reply')}</li>
          </ul>
        </div>,
        false,
      )
      const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
      for (const article of screen.getAllByRole('article')) {
        within(article).getByRole('button', { name: 'More actions' }).focus()
        await vi.waitFor(() => {
          const bar = within(article).getByRole('toolbar').getBoundingClientRect()
          const name = within(article).getByRole('button', { name: 'Abdelrahman Mostafa Elshazly' }).getBoundingClientRect()
          const time = article.querySelector('time')!.getBoundingClientRect()
          expect([overlaps(bar, name), overlaps(bar, time)]).toEqual([false, false])
        })
      }
    } finally {
      await page.viewport(414, 896)
    }
  })

  it('it rises 16px above its row, and sits inside the top row of a list so it is never cut off', async () => {
    await page.viewport(1280, 800)
    try {
      mount(
        <div role="log" aria-label="Messages" style={{ height: 300, overflowY: 'auto' }}>
          <ChannelMessage message={message('first')} users={users} ctx={ctx} meId="u-1" canPost continuation={false} />
          <ChannelMessage message={message('second')} users={users} ctx={ctx} meId="u-1" canPost continuation={false} />
        </div>,
        false,
      )
      const [first, second] = screen.getAllByRole('article')
      const [top, next] = screen.getAllByRole('toolbar', { name: 'Message actions' })
      const log = screen.getByRole('log').getBoundingClientRect()
      await userEvent.hover(first)
      await vi.waitFor(() => expect(top.getBoundingClientRect().top).toBeGreaterThanOrEqual(log.top))
      await userEvent.hover(second)
      await vi.waitFor(() => expect(Math.round(second.getBoundingClientRect().top - next.getBoundingClientRect().top)).toBe(16))
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
    const chip = await within(screen.getByRole('list', { name: 'Reactions' })).findByRole('button', { name: 'Add reaction' })
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

  it("Escape puts focus back on the message's toolbar", async () => {
    const mine = message('fix this', { senderId: 'u-1' })
    mount(<ChannelMessage message={mine} users={users} ctx={ctx} meId="u-1" canPost continuation={false} />, false)
    screen.getByRole('button', { name: 'More actions' }).focus()
    await userEvent.keyboard('e')
    await editBox()
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More actions' })))
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

describe('Activity on a phone (spec 10: every screen works at 390px)', () => {
  it('its header and rows fit the width, with nothing scrolling sideways', async () => {
    await page.viewport(390, 844)
    try {
      mount(<ActivityView items={activity} ws="engineering" placeOf={() => '#a-very-long-channel-name-indeed'} error={false} retrying={false} onRetry={vi.fn()} onOpen={vi.fn()} onMarkAllRead={vi.fn()} marking={false} markError={null} />, false)
      const main = document.querySelector('main')!
      main.style.width = '390px'
      main.style.padding = '0'
      const section = screen.getByRole('region', { name: 'Activity' })
      expect(section.scrollWidth).toBeLessThanOrEqual(section.clientWidth)
      const header = section.querySelector('header')!
      expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth)
      for (const link of screen.getAllByRole('link')) expect(link.getBoundingClientRect().right).toBeLessThanOrEqual(390)
      expect(screen.getByRole('button', { name: 'Mark all read' }).getBoundingClientRect().right).toBeLessThanOrEqual(390)
      // The selected tab's rule sits on the row's line without making the row scroll (a stray scrollbar).
      const tabs = screen.getByRole('tablist', { name: 'Activity' })
      expect(tabs.scrollHeight).toBeLessThanOrEqual(tabs.clientHeight)
    } finally {
      await page.viewport(414, 896)
    }
  })

  it('Unread only and Mark all read answer a 44px touch (spec 6.16), and tapping the words flips the switch', async () => {
    await page.viewport(390, 844)
    try {
      mount(<ActivityView items={activity} ws="engineering" placeOf={() => '#backend'} error={false} retrying={false} onRetry={vi.fn()} onOpen={vi.fn()} onMarkAllRead={vi.fn()} marking={false} markError={null} />, false)
      Object.assign(document.querySelector('main')!.style, { width: '390px', padding: '0' })
      /** Whether a touch this far above and below the middle of `el` lands on `target`. */
      const answers = (el: Element, target: Element, reach: number) => {
        const r = el.getBoundingClientRect()
        const x = r.left + r.width / 2
        const y = r.top + r.height / 2
        return [y - reach, y + reach].map((at) => target.contains(document.elementFromPoint(x, at)))
      }
      const toggle = screen.getByRole('switch', { name: 'Unread only' })
      const words = screen.getByText('Unread only')
      expect(answers(toggle, toggle.closest('label') ?? toggle, 21)).toEqual([true, true])
      const mark = screen.getByRole('button', { name: 'Mark all read' })
      expect(answers(mark, mark, 21)).toEqual([true, true])
      await userEvent.click(words)
      expect(toggle.getAttribute('aria-checked')).toBe('true')
    } finally {
      await page.viewport(414, 896)
    }
  })
})

describe('Channel details on a phone (spec 10, 6.16)', () => {
  it('fits 390px with nothing scrolling sideways, and its tabs and buttons answer a 44px touch', async () => {
    await page.viewport(390, 844)
    try {
      mount(details(), false)
      const dialog = screen.getByRole('dialog', { name: 'backend' })
      expect(dialog.getBoundingClientRect().right).toBeLessThanOrEqual(390 - 16)
      expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth)
      expect(screen.getByRole('tab', { name: 'About' }).getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
      /** Whether a touch 21px above and below the middle of `el` lands on it. */
      const answers = (el: Element) => {
        const r = el.getBoundingClientRect()
        const x = r.left + r.width / 2
        return [r.top + r.height / 2 - 21, r.top + r.height / 2 + 21].map((y) => el.contains(document.elementFromPoint(x, y)))
      }
      for (const name of ['Edit topic', 'Star channel', 'Channel notifications: Mentions and keywords', 'Copy channel link']) expect(answers(screen.getByRole('button', { name })), name).toEqual([true, true])
      await userEvent.click(screen.getByRole('tab', { name: 'Members 2' }))
      expect(answers(screen.getByRole('button', { name: 'Remove Nour El-Sayed' }))).toEqual([true, true])
    } finally {
      await page.viewport(414, 896)
    }
  })
})

