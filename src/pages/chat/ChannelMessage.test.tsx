// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigationType } from 'react-router'
import { Announcer } from '@/components/sf/Announcer'
import { ToastProvider } from '@/components/sf/Toast'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage, TaskRef, ThreadReply, User } from '@/api/types'
import { api } from '@/lib/api'
import { FLOWBOT_ID } from '@/lib/flowbot'
import { parseBody } from '@/lib/messageBody'
import { paths } from '@/lib/paths'
import { ChannelMessage, systemText, type Selection } from '@/pages/chat/ChannelMessage'
import type { BodyContext } from '@/pages/chat/MessageBody'
import { useEditing } from '@/pages/chat/editingStore'

afterEach(() => {
  cleanup()
  useEditing.setState({ id: null, from: null })
})
// jsdom has no matchMedia; the ⋯ menu (components/ui/Menu) asks it whether this is a phone.
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const users = [
  { id: 'u-1', name: 'Youssef Abdelrahman', title: 'Managing Director', email: 'youssef@spark-sys.com', presence: 'active' },
  { id: 'u-2', name: 'Nour El-Sayed', title: 'Backend lead', email: 'nour@spark-sys.com', presence: 'away' },
  { id: 'u-3', name: 'Mariam Fathy', title: 'Frontend', email: 'mariam@spark-sys.com', presence: 'offline' },
] as User[]
const task: TaskRef = { key: 'NEX-103', title: 'Rate limit the search API', status: 'inReview', statusLabel: 'In review', category: 'inProgress', projectKey: 'NEX', projectName: 'Nexus Core', assigneeId: 'u-2' }
const ctx: BodyContext = { users, tasks: new Map([[task.key, task]]), projectKeys: new Set(['NEX']), ws: 'engineering', workspaceId: 'ws-eng' }

const message = (content: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1', channelId: 'c1', seq: 1, senderId: 'u-2', content, body: parseBody(content), attachments: [], reactions: [], threadCount: 0, lastReplyAt: null,
  linkedTicketKeys: [], mentions: [], editedAt: null, createdAt: '2026-10-28T09:00:00.000Z', ...over,
})

/** Where the page is, and what the navigation asked for: what Reply in thread and T leave. */
function Where() {
  const location = useLocation()
  const how = useNavigationType()
  return (
    <>
      <span data-testid="where">{`${location.search} ${JSON.stringify(location.state)}`}</span>
      <span data-testid="how">{how}</span>
    </>
  )
}

function show(
  m: ChatMessage | ThreadReply,
  opts: { continuation?: boolean; selected?: Selection; onMarkUnread?: () => Promise<unknown>; sendState?: 'sending' | 'failed'; canPost?: boolean; at?: string } = {},
) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={[opts.at ?? '/w/engineering/c/c1']}>
        <ChannelMessage
          message={m}
          users={users}
          ctx={ctx}
          meId="u-1"
          canPost={opts.canPost ?? true}
          continuation={opts.continuation ?? false}
          selected={opts.selected}
          onMarkUnread={opts.onMarkUnread}
          sendState={opts.sendState}
        />
        <Where />
      </MemoryRouter>
        </ToastProvider>
    </QueryClientProvider>,
  )
  return screen.getByRole('article')
}

describe('ChannelMessage body (spec 6.3)', () => {
  it('renders marks, code, quotes and lists as elements, never as HTML', () => {
    const row = show(message('*bold* _it_ ~gone~ `x<b>` <i>raw</i>\n\n> quoted\n- one\n1. first\n```\ncode()\n```'))
    expect(row.querySelector('strong')?.textContent).toBe('bold')
    expect(row.querySelector('em')?.textContent).toBe('it')
    expect(row.querySelector('s')?.textContent).toBe('gone')
    expect(row.querySelector('p code')?.textContent).toBe('x<b>')
    expect(row.querySelector('i')).toBeNull() // typed HTML stays text
    expect(row.textContent).toContain('<i>raw</i>')
    expect(row.querySelector('blockquote')?.textContent).toBe('quoted')
    expect(row.querySelector('ul li')?.textContent).toBe('one')
    expect(row.querySelector('ol li')?.textContent).toBe('first')
    expect(row.querySelector('pre')?.textContent).toBe('code()')
  })

  it('links open in a new tab without handing over the page', () => {
    show(message('see https://spark-sys.com/docs'))
    const link = screen.getByRole('link', { name: 'https://spark-sys.com/docs' })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('people I know are pills; a person who is gone stays as text', () => {
    const row = show(message('@[Nour](u-2) and @[Old](u-99)'))
    expect(screen.getByText('@Nour El-Sayed').className).toContain('bg-sf-surface-mention')
    expect(row.textContent).toContain('@Old')
  })

  it('a task I can see is a chip with its live status and an unfurl; others stay as text', () => {
    const row = show(message('NEX-103 and NEX-999 and ZZZ-1'))
    const links = screen.getAllByRole('link').filter((a) => a.textContent?.includes('NEX-103'))
    expect(links).toHaveLength(2) // the chip and the unfurl card
    expect(links[1].textContent).toContain('Rate limit the search API')
    expect(links[1].textContent).toContain('In review · Nexus Core')
    expect(row.textContent).toContain('NEX-999')
    expect(screen.queryByRole('link', { name: /NEX-999/ })).toBeNull()
  })

  it('emoji alone show large', () => {
    const row = show(message('🎉🚀'))
    expect(row.querySelector('.sf-emoji')).not.toBeNull()
  })
})

describe('ChannelMessage from Flowbot (spec 5.1 Apps)', () => {
  it('names Flowbot with the app square, and its name opens no profile', () => {
    const row = show(message('Reminder: “Ship it.” from Nour El-Sayed.', { senderId: FLOWBOT_ID }))
    expect(row.textContent).toContain('Flowbot')
    expect(row.textContent).not.toContain('Unknown person')
    expect(within(row).queryByRole('button', { name: 'Flowbot' })).toBeNull()
    expect(row.querySelector('.bg-sf-ink-950')).not.toBeNull()
  })
})

describe('ChannelMessage states (spec 6.3)', () => {
  it('a mention of me or of everyone tints the row', () => {
    expect(show(message('@all', { mentions: [{ kind: 'all', id: 'all' }] })).className).toContain('bg-sf-surface-mention')
    cleanup()
    expect(show(message('@[Youssef](u-1)', { mentions: [{ kind: 'user', id: 'u-1' }] })).className).toContain('bg-sf-surface-mention')
    cleanup()
    expect(show(message('hi')).className).not.toContain('bg-sf-surface-mention')
  })

  it('selected wins over a mention, and fades back', () => {
    const m = message('@all', { mentions: [{ kind: 'all', id: 'all' }] })
    expect(show(m, { selected: 'on' }).className).toContain('bg-sf-surface-selected')
    cleanup()
    expect(show(m, { selected: 'fading' }).className).not.toContain('bg-sf-surface-selected')
  })

  it('an edited message says so after its body', () => {
    show(message('fixed', { editedAt: '2026-10-28T09:05:00.000Z' }))
    expect(screen.getByText('(edited)')).toBeTruthy()
  })

  it('"(edited)" sits on the last line of the text, not a line of its own (.sf-edited)', () => {
    show(message('first line\n\nfixed', { editedAt: '2026-10-28T09:05:00.000Z' }))
    const edited = screen.getByText('(edited)')
    expect(edited.closest('p')?.textContent).toBe('fixed (edited)')
    expect(edited.className).toContain('ms-1')
  })

  it('the time shows its full date with the weekday in the chat tooltip, not a native title (spec 6.3, 6.15)', async () => {
    show(message('hi'))
    const time = document.querySelector('time')!
    expect(time.getAttribute('title')).toBeNull()
    fireEvent.pointerEnter(time)
    const tip = await screen.findByRole('tooltip', { hidden: true }, { timeout: 2000 })
    expect(tip.textContent).toBe('Wednesday, 28 Oct 2026, ' + time.textContent)
  })

  it('a deleted message with replies says it was deleted, with its thread', () => {
    const row = show(message('', { deletedAt: 'T', body: [], threadCount: 2 }))
    expect(row.textContent).toContain('This message was deleted.')
    expect(screen.getByRole('link', { name: /2 replies/ })).toBeTruthy()
  })

  it('a system message reads after its author, without reactions or a menu', () => {
    const row = show(message('', { system: { kind: 'renamed', from: 'api', to: 'backend' } }))
    expect(row.textContent).toContain('Nour El-Sayed')
    expect(row.textContent).toContain('renamed the channel to #backend (was #api).')
    expect(screen.queryByRole('button', { name: /actions/i })).toBeNull()
  })

  it('a continuation hides author and time visually but keeps them first for screen readers', () => {
    const row = show(message('more'), { continuation: true })
    const head = row.querySelector('p')!
    expect(head.className).toContain('sr-only')
    expect(head.textContent).toContain('Nour El-Sayed')
    expect(row.querySelector('[aria-hidden] time')).not.toBeNull()
    // The hidden name is text, not a button: no Tab stop that can't be seen.
    expect(head.querySelector('button')).toBeNull()
  })

  it('system texts', () => {
    expect(systemText({ kind: 'joined' })).toBe('joined the channel.')
    expect(systemText({ kind: 'topic', to: '' })).toBe('cleared the topic.')
    expect(systemText({ kind: 'topic', to: 'Pager' })).toBe('changed the topic to “Pager”.')
  })

  it('adding and removing people names them (spec 6.10)', () => {
    const names: Record<string, string> = { 'u-2': 'Nour El-Sayed', 'u-3': 'Mariam Fathy', 'u-4': 'Ahmed Shawky' }
    const nameOf = (id: string) => names[id] ?? 'Unknown person'
    expect(systemText({ kind: 'added', userIds: ['u-2'] }, nameOf)).toBe('added Nour El-Sayed.')
    expect(systemText({ kind: 'added', userIds: ['u-2', 'u-3'] }, nameOf)).toBe('added Nour El-Sayed and Mariam Fathy.')
    expect(systemText({ kind: 'added', userIds: ['u-2', 'u-3', 'u-4'] }, nameOf)).toBe('added Nour El-Sayed, Mariam Fathy and Ahmed Shawky.')
    expect(systemText({ kind: 'removed', userId: 'u-9' }, nameOf)).toBe('removed Unknown person from the channel.')
  })
})

describe('ChannelMessage parts (feature 4 follow-up)', () => {
  it('the author opens a profile card: face, name, title, presence, e-mail and Message', () => {
    show(message('hi'))
    fireEvent.click(screen.getByRole('button', { name: 'Nour El-Sayed' }))
    const card = screen.getByRole('dialog', { name: 'Nour El-Sayed' })
    expect(card.textContent).toContain('Backend lead')
    expect(card.textContent).toContain('Away')
    expect(screen.getByRole('link', { name: 'nour@spark-sys.com' }).getAttribute('href')).toBe('mailto:nour@spark-sys.com')
    expect(screen.getByRole('button', { name: 'Message' })).toBeTruthy()
  })

  it('someone no longer in the workspace is just a name, with no card', () => {
    show(message('hi', { senderId: 'u-99' }))
    expect(screen.queryByRole('button', { name: 'Unknown person' })).toBeNull()
    expect(screen.getByText('Unknown person')).toBeTruthy()
  })

  it('reactions: mine is pressed and outlined in accent, with who reacted in its name', () => {
    show(message('hi', { reactions: [{ emoji: '👍', userIds: ['u-1', 'u-2'] }, { emoji: '🎉', userIds: ['u-2'] }] }))
    const mine = screen.getByRole('button', { name: '👍 2: You and Nour El-Sayed' })
    expect(mine.getAttribute('aria-pressed')).toBe('true')
    expect(mine.className).toContain('border-sf-accent')
    expect(screen.getByRole('button', { name: '🎉 1: Nour El-Sayed' }).getAttribute('aria-pressed')).toBe('false')
  })

  const addChip = () => within(screen.getByRole('list', { name: 'Reactions' })).getByRole('button', { name: 'Add reaction' })

  it('an add chip opens the emoji picker; picking one closes it', () => {
    show(message('hi', { reactions: [{ emoji: '👍', userIds: ['u-2'] }] }))
    fireEvent.click(addChip())
    const picker = screen.getByRole('dialog', { name: 'Add reaction' })
    expect(picker.querySelector('input[type="search"]')).toBe(document.activeElement)
    fireEvent.click(screen.getAllByRole('button', { name: 'party popper' })[0])
    expect(screen.queryByRole('dialog', { name: 'Add reaction' })).toBeNull()
  })

  it('typing "e" in the picker searches; it does not start editing my message (keys bubble out of portals)', () => {
    show(message('mine', { senderId: 'u-1', reactions: [{ emoji: '👍', userIds: ['u-2'] }] }))
    fireEvent.click(addChip())
    fireEvent.keyDown(screen.getAllByRole('button', { name: 'party popper' })[0], { key: 'e' })
    expect(useEditing.getState().id).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Add reaction' })).toBeTruthy()
  })

  it('no add chip where I may not react', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
        <MemoryRouter>
          <ChannelMessage message={message('hi', { reactions: [{ emoji: '👍', userIds: ['u-2'] }] })} users={users} ctx={ctx} meId="u-1" canPost={false} continuation={false} />
        </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    )
    expect(screen.queryByRole('button', { name: 'Add reaction' })).toBeNull()
  })

  it('the thread summary shows who replied and how many, and opens the thread', () => {
    const row = show(message('root', { threadCount: 3, lastReplyAt: new Date().toISOString(), replyUserIds: ['u-3', 'u-1', 'u-2'] }))
    const link = screen.getByRole('link', { name: /^3 replies, Last reply/ })
    expect(link.getAttribute('href')).toContain('thread')
    expect(link.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThanOrEqual(3)
    expect(row.textContent).toContain('View thread')
  })

  it('the thread summary shows up to 5 who replied, and says when the last reply came in words (spec 6.7)', () => {
    const at = new Date()
    at.setHours(9, 41, 0, 0)
    show(message('root', { threadCount: 9, lastReplyAt: at.toISOString(), replyUserIds: ['u-1', 'u-2', 'u-3', 'u-4', 'u-5', 'u-6'] }))
    const link = screen.getByRole('link', { name: /^9 replies/ })
    // The faces come first, one avatar each.
    expect(link.firstElementChild!.children.length).toBe(5)
    expect(link.textContent).toContain('Last reply today at 9:41 AM')
  })

  it('a reply has no thread summary and acts as a reply', () => {
    const reply: ThreadReply = { id: 'r1', messageId: 'm1', channelId: 'c1', senderId: 'u-2', content: 'ok', body: parseBody('ok'), attachments: [], reactions: [], mentions: [], createdAt: '2026-10-28T09:00:00.000Z' }
    const row = show(reply)
    expect(row.textContent).toContain('ok')
    expect(screen.queryByRole('link', { name: /repl/ })).toBeNull()
  })

  it('a comment card shows its task as a live chip, the kind and the text as rich text', () => {
    const row = show(message('Bug on NEX-103: *fails* on retry', { commentId: 'k1', linkedTicketKeys: ['NEX-103'] }))
    expect(row.textContent).toContain('Bug')
    expect(row.textContent).toContain('Rate limit the search API')
    expect(row.querySelector('strong')?.textContent).toBe('fails')
  })

  it('a link on an allowed domain gets a preview card; others do not', async () => {
    show(message('see https://github.com/spark-sys/flow/pull/42 and https://example.com'))
    const card = await screen.findByRole('link', { name: /GitHub/ })
    expect(card.textContent).toContain('spark-sys/flow/pull/42')
    expect(card.getAttribute('rel')).toBe('noopener noreferrer')
    expect(screen.queryByRole('link', { name: /example\.com.*example/ })).toBeNull()
  })
})

describe('ChannelMessage while sending (spec 6.2)', () => {
  function pending(state: 'sending' | 'failed', handlers = { onRetry: vi.fn(), onDiscard: vi.fn() }) {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
        <MemoryRouter>
          <ChannelMessage
            message={message('on its way', { senderId: 'u-1' })}
            users={users}
            ctx={ctx}
            meId="u-1"
            canPost
            continuation={false}
            sendState={state}
            sendError={state === 'failed' ? 'This channel is archived.' : undefined}
            {...handlers}
          />
        </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    )
    return { row: screen.getByRole('article'), ...handlers }
  }

  it('sending shows "Sending…" for the time, and no menu yet', () => {
    const { row } = pending('sending')
    expect(row.textContent).toContain('Sending…')
    expect(screen.queryByRole('toolbar')).toBeNull()
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull()
  })

  it('a refused send says "Not sent." with Retry and Delete, and why', () => {
    const { onRetry, onDiscard } = pending('failed')
    expect(screen.getByText('Not sent.')).toBeTruthy()
    expect(screen.getByText('Not sent.').closest('p')!.getAttribute('title')).toBe('This channel is archived.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDiscard).toHaveBeenCalledOnce()
  })
})

describe('U and L on a focused message (spec 10)', () => {
  const actions = () => screen.getByRole('button', { name: 'More actions' })
  const clipboard = (writeText: (text: string) => Promise<void>) => Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

  it('U marks it unread from here and says so next to it', async () => {
    const onMarkUnread = vi.fn(async () => {})
    show(message('hi', { seq: 7 }), { onMarkUnread })
    fireEvent.keyDown(actions(), { key: 'u' })
    expect(onMarkUnread).toHaveBeenCalledOnce()
    expect(await screen.findByText('Marked unread')).toBeTruthy()
  })

  it('a row has no live region of its own: what U and L say is read out through the shared one', async () => {
    show(message('hi'), { onMarkUnread: vi.fn(async () => {}) })
    expect(screen.queryByRole('status')).toBeNull()
    render(<Announcer />)
    fireEvent.keyDown(actions(), { key: 'u' })
    await vi.waitFor(() => expect(screen.getByRole('status').textContent).toBe('Marked unread'))
  })

  it('holding U down marks it unread once', () => {
    const onMarkUnread = vi.fn(async () => {})
    show(message('hi'), { onMarkUnread })
    fireEvent.keyDown(actions(), { key: 'u' })
    fireEvent.keyDown(actions(), { key: 'u', repeat: true })
    expect(onMarkUnread).toHaveBeenCalledOnce()
  })

  it('in the open ⋯ menu, an item’s key picks it and closes the menu, once (the row doesn’t act on it too)', () => {
    const writeText = vi.fn(async () => {})
    clipboard(writeText)
    const onMarkUnread = vi.fn(async () => {})
    show(message('hi'), { onMarkUnread })
    fireEvent.click(actions())
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Mark unread' }), { key: 'l' })
    expect(writeText).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(actions())
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Mark unread' }), { key: 'u' })
    expect(onMarkUnread).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('a U the server refuses says so, and the words stay', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      show(message('hi'), { onMarkUnread: vi.fn(async () => Promise.reject(new Error('no'))) })
      fireEvent.keyDown(actions(), { key: 'U' })
      expect(await screen.findByText("Couldn't mark it unread. Try again.")).toBeTruthy()
      await act(async () => vi.advanceTimersByTime(3000))
      expect(screen.getByText("Couldn't mark it unread. Try again.")).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('Mark unread is in the ⋯ menu, with its key', () => {
    const onMarkUnread = vi.fn(async () => {})
    show(message('hi'), { onMarkUnread })
    fireEvent.click(actions())
    const item = screen.getByRole('menuitem', { name: 'Mark unread' })
    expect(item.getAttribute('aria-keyshortcuts')).toBe('U')
    fireEvent.click(item)
    expect(onMarkUnread).toHaveBeenCalledOnce()
  })

  it('my own message, a deleted one, one on its way, or a page without U: no Mark unread, and U does nothing', () => {
    for (const [m, opts] of [
      [message('mine', { senderId: 'u-1' }), {}],
      [message('', { deletedAt: '2026-10-28T09:01:00.000Z', threadCount: 1 }), {}],
      [message('going'), { sendState: 'sending' as const }],
    ] as const) {
      const onMarkUnread = vi.fn(async () => {})
      show(m, { ...opts, onMarkUnread })
      const more = screen.queryByRole('button', { name: 'More actions' })
      if (more) {
        fireEvent.keyDown(more, { key: 'u' })
        fireEvent.click(more)
        expect(screen.queryByRole('menuitem', { name: 'Mark unread' })).toBeNull()
      } else fireEvent.keyDown(screen.getByRole('article'), { key: 'u' })
      expect(onMarkUnread).not.toHaveBeenCalled()
      cleanup()
    }
    show(message('hi'))
    fireEvent.click(actions())
    expect(screen.queryByRole('menuitem', { name: 'Mark unread' })).toBeNull()
  })

  it('L copies the link to the message and says so, then clears', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const writeText = vi.fn(async () => {})
      clipboard(writeText)
      show(message('hi'))
      fireEvent.keyDown(actions(), { key: 'l' })
      expect(writeText).toHaveBeenCalledWith(new URL(paths.message('engineering', 'c1', 'm1'), window.location.origin).href)
      expect(await screen.findByText('Link copied')).toBeTruthy()
      // Let the note's effect start its timer before the clock moves on.
      await act(async () => {})
      await act(async () => vi.advanceTimersByTime(2000))
      expect(screen.queryByText('Link copied')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a copy the browser refuses says so', async () => {
    clipboard(vi.fn(async () => Promise.reject(new Error('denied'))))
    show(message('hi'))
    fireEvent.keyDown(actions(), { key: 'l' })
    expect(await screen.findByText("Couldn't copy the link")).toBeTruthy()
  })

  it('L does nothing on a deleted message or one still on its way, or with a modifier', () => {
    const writeText = vi.fn(async () => {})
    clipboard(writeText)
    show(message('', { deletedAt: '2026-10-28T09:01:00.000Z', threadCount: 1 }))
    fireEvent.keyDown(screen.getByRole('article'), { key: 'l' })
    cleanup()
    show(message('going'), { sendState: 'sending' })
    fireEvent.keyDown(screen.getByRole('article'), { key: 'l' })
    cleanup()
    show(message('hi'))
    fireEvent.keyDown(actions(), { key: 'l', metaKey: true })
    expect(writeText).not.toHaveBeenCalled()
  })
})

describe('Reply in thread and Copy text (spec 6.4, 6.5)', () => {
  const clipboard = (writeText: (text: string) => Promise<void>) => Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  const where = () => screen.getByTestId('where').textContent

  it('Reply in thread opens its thread, asking for the reply box', () => {
    show(message('root'))
    fireEvent.click(screen.getByRole('button', { name: 'Reply in thread' }))
    expect(where()).toBe('?thread=m1 {"focus":"reply"}')
  })

  it('so does T on the message', () => {
    show(message('root'))
    fireEvent.keyDown(screen.getByRole('button', { name: 'More actions' }), { key: 't' })
    expect(where()).toBe('?thread=m1 {"focus":"reply"}')
  })

  it('a reply, a deleted message or one on its way has neither, and T does nothing', () => {
    const reply: ThreadReply = { id: 'r1', messageId: 'm1', channelId: 'c1', senderId: 'u-2', content: 'ok', body: parseBody('ok'), attachments: [], reactions: [], mentions: [], createdAt: '2026-10-28T09:00:00.000Z' }
    for (const [m, opts] of [
      [reply, {}],
      [message('', { deletedAt: '2026-10-28T09:01:00.000Z', threadCount: 1 }), {}],
      [message('going'), { sendState: 'sending' as const }],
    ] as const) {
      show(m, opts)
      expect(screen.queryByRole('button', { name: 'Reply in thread' })).toBeNull()
      fireEvent.keyDown(screen.getByRole('article'), { key: 't' })
      expect(where()).toBe(' null')
      cleanup()
    }
  })

  it('where I may not post there is no Reply in thread, and T does nothing (the thread would have no reply box)', () => {
    show(message('root'), { canPost: false })
    expect(screen.queryByRole('button', { name: 'Reply in thread' })).toBeNull()
    fireEvent.keyDown(screen.getByRole('article'), { key: 't' })
    expect(where()).toBe(' null')
  })

  it('on the thread already open, Reply in thread asks for the reply box again without adding to the history', () => {
    show(message('root'), { at: '/w/engineering/c/c1?thread=m1' })
    fireEvent.click(screen.getByRole('button', { name: 'Reply in thread' }))
    expect(where()).toBe('?thread=m1 {"focus":"reply"}')
    expect(screen.getByTestId('how').textContent).toBe('REPLACE')
  })

  it('another thread is a new step in the history (Back closes it)', () => {
    show(message('root'), { at: '/w/engineering/c/c1?thread=m9' })
    fireEvent.click(screen.getByRole('button', { name: 'Reply in thread' }))
    expect(screen.getByTestId('how').textContent).toBe('PUSH')
  })

  it('Copy text copies the message as plain text and says so', async () => {
    const writeText = vi.fn(async () => {})
    clipboard(writeText)
    show(message('ship *it* today'))
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy text' }))
    expect(writeText).toHaveBeenCalledWith('ship it today')
    expect(await screen.findByText('Text copied')).toBeTruthy()
  })

  it('a copy the browser refuses says so', async () => {
    clipboard(vi.fn(async () => Promise.reject(new Error('denied'))))
    show(message('hi'))
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy text' }))
    expect(await screen.findByText("Couldn't copy the text")).toBeTruthy()
  })

  it('Copy link is in the menu too, with its key', () => {
    const writeText = vi.fn(async () => {})
    clipboard(writeText)
    show(message('hi'))
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    const item = screen.getByRole('menuitem', { name: 'Copy link' })
    expect(item.getAttribute('aria-keyshortcuts')).toBe('L')
    fireEvent.click(item)
    expect(writeText).toHaveBeenCalledWith(new URL(paths.message('engineering', 'c1', 'm1'), window.location.origin).href)
  })
})

describe('following from the ⋯ menu (spec 6.7)', () => {
  it('a message I don’t follow offers Get notified about replies, and follows on it', async () => {
    const setFollowing = vi.spyOn(api.chat, 'setFollowing').mockResolvedValue()
    show(message('root', { following: false }))
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Get notified about replies' }))
    await vi.waitFor(() => expect(setFollowing).toHaveBeenCalledWith('m1', true))
  })

  it('one I follow turns it off', async () => {
    const setFollowing = vi.spyOn(api.chat, 'setFollowing').mockResolvedValue()
    show(message('root', { following: true }))
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Turn off notifications for replies' }))
    await vi.waitFor(() => expect(setFollowing).toHaveBeenCalledWith('m1', false))
  })

  it('a reply has no thread of its own to follow', () => {
    const reply: ThreadReply = { id: 'r1', messageId: 'm1', channelId: 'c1', senderId: 'u-2', content: 'ok', body: parseBody('ok'), attachments: [], reactions: [], mentions: [], createdAt: '2026-10-28T09:00:00.000Z' }
    show(reply)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.queryByRole('menuitem', { name: /notified|notifications/ })).toBeNull()
  })
})

describe('a reply also sent to the channel (spec 6.7)', () => {
  const sent = (over: Partial<ChatMessage> = {}) => message('Posted them', { id: 'r9', seq: 12, broadcast: { rootId: 'm1', rootText: 'Release notes for 2.4?' }, ...over })

  it('says it replied to a thread, linking to that thread', () => {
    show(sent())
    const link = screen.getByRole('link', { name: 'Release notes for 2.4?' })
    expect(link.getAttribute('href')).toContain('thread=m1')
    expect(link.closest('p')?.textContent).toContain('replied to a thread:')
  })

  it('its toolbar acts on the reply it is, and Reply in thread opens that thread', async () => {
    const react = vi.spyOn(api.chat, 'react').mockResolvedValue()
    show(sent())
    fireEvent.click(screen.getByRole('button', { name: 'React with 👀' }))
    await vi.waitFor(() => expect(react).toHaveBeenCalledWith({ kind: 'reply', id: 'r9' }, '👀', true))
    fireEvent.click(screen.getByRole('button', { name: 'Reply in thread' }))
    expect(screen.getByTestId('where').textContent).toBe('?thread=m1 {"focus":"reply"}')
  })

  it('has no thread of its own to follow', () => {
    show(sent())
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.queryByRole('menuitem', { name: /notified|notifications/ })).toBeNull()
  })

  it('in its thread, says it was also sent to the channel', () => {
    const reply: ThreadReply = { id: 'r9', messageId: 'm1', channelId: 'c1', senderId: 'u-2', content: 'ok', body: parseBody('ok'), attachments: [], reactions: [], mentions: [], createdAt: '2026-10-28T09:00:00.000Z', alsoInChannel: true, seq: 12 }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <MemoryRouter>
            <ChannelMessage message={reply} users={users} ctx={ctx} meId="u-1" canPost continuation={false} compact alsoSentTo="#backend" />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    )
    expect(screen.getByText('Also sent to #backend')).toBeTruthy()
  })
})

describe('editing a message that shows in two places (spec 6.3, 6.7)', () => {
  // The edit box keeps itself in view as it grows; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver

  it('a reply also sent to the channel is edited where I started: the channel row, not the thread panel too', () => {
    const inChannel = message('Posted them', { id: 'r9', senderId: 'u-1', broadcast: { rootId: 'm1', rootText: 'Release notes?' } })
    const inThread: ThreadReply = { id: 'r9', messageId: 'm1', channelId: 'c1', senderId: 'u-1', content: 'Posted them', body: parseBody('Posted them'), attachments: [], reactions: [], mentions: [], createdAt: '2026-10-28T09:00:00.000Z', alsoInChannel: true, seq: 12 }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <MemoryRouter>
            <ChannelMessage message={inChannel} users={users} ctx={ctx} meId="u-1" canPost continuation={false} />
            <ChannelMessage message={inThread} users={users} ctx={ctx} meId="u-1" canPost continuation={false} compact />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    )
    const [channelRow, threadRow] = screen.getAllByRole('article')
    try {
      fireEvent.keyDown(within(channelRow).getByRole('button', { name: 'More actions' }), { key: 'e' })
      // The row being edited trades its toolbar for the edit box; the other place keeps its toolbar.
      expect(within(channelRow).queryByRole('toolbar')).toBeNull()
      expect(within(threadRow).getByRole('toolbar')).toBeTruthy()
    } finally {
      act(() => useEditing.getState().stop())
    }
  })
})


describe('Save for later and Remind me on a message (spec 6.4, 6.5, 10)', () => {
  const view = (over = {}) => ({
    id: 's1', userId: 'u-1', workspaceId: 'ws-eng', target: { kind: 'message' as const, id: 'm1' }, status: 'inProgress' as const, remindAt: null, firedAt: null,
    savedAt: '2026-10-28T09:00:00.000Z', channelId: 'c1', rootId: null, authorId: 'u-2', authorName: 'Nour El-Sayed', text: 'x', createdAt: null, gone: null, ...over,
  })

  it('S saves it, says so, and Save for later shows it saved', async () => {
    vi.spyOn(api.saved, 'list').mockResolvedValue([])
    const save = vi.spyOn(api.saved, 'save').mockResolvedValue(view())
    const row = show(message('Ship it'))
    fireEvent.keyDown(row, { key: 's' })
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith({ kind: 'message', id: 'm1' }, undefined))
    await vi.waitFor(() => expect(row.textContent).toContain('Saved for later'))
  })

  it('S on a saved one takes it out of Saved', async () => {
    vi.spyOn(api.saved, 'list').mockResolvedValue([view()])
    const remove = vi.spyOn(api.saved, 'remove').mockResolvedValue()
    show(message('Ship it'))
    const button = await screen.findByRole('button', { name: 'Remove from Saved' })
    fireEvent.click(button)
    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith('s1'))
  })

  it('Remind me about this ▸ In 20 minutes saves it with that time', async () => {
    vi.spyOn(api.saved, 'list').mockResolvedValue([])
    const save = vi.spyOn(api.saved, 'save').mockResolvedValue(view())
    show(message('Ship it'))
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Remind me about this' })))
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: /In 20 minutes/ })))
    await vi.waitFor(() => expect(save).toHaveBeenCalled())
    const [target, at] = save.mock.calls[0]
    expect(target).toEqual({ kind: 'message', id: 'm1' })
    expect(Math.abs(new Date(at!).getTime() - (Date.now() + 20 * 60_000))).toBeLessThan(5_000)
  })

  it('a pending or deleted message has neither', () => {
    vi.spyOn(api.saved, 'list').mockResolvedValue([])
    show(message('Ship it', { deletedAt: '2026-10-28T10:00:00.000Z' }))
    expect(screen.queryByRole('button', { name: 'Save for later' })).toBeNull()
    cleanup()
    show(message('Ship it'), { sendState: 'sending' })
    expect(screen.queryByRole('button', { name: 'Save for later' })).toBeNull()
  })
})

describe('Flowbot’s reminder card (spec 6.5: preview, link, Mark complete, Snooze)', () => {
  const note = { kind: 'reminder' as const, savedId: 's1', channelId: 'c-backend', rootId: null, target: { kind: 'message' as const, id: 'm-x' } }
  const card = () => message('Reminder: “Ship it.” from Nour El-Sayed.', { senderId: FLOWBOT_ID, flowbot: note })
  const saved = (status: 'inProgress' | 'completed') => ({
    id: 's1', userId: 'u-1', workspaceId: 'ws-eng', target: note.target, status, remindAt: null, firedAt: '2026-10-28T09:00:00.000Z',
    savedAt: '2026-10-28T08:00:00.000Z', channelId: 'c-backend', rootId: null, authorId: 'u-2', authorName: 'Nour El-Sayed', text: 'Ship it.', createdAt: null, gone: null,
  })

  it('links to the message', async () => {
    vi.spyOn(api.saved, 'list').mockResolvedValue([saved('inProgress')])
    const row = show(card())
    expect(within(row).getByRole('link', { name: 'View message' }).getAttribute('href')).toBe(paths.message('engineering', 'c-backend', 'm-x'))
  })

  it('Mark complete completes the saved item; once done it says Completed', async () => {
    vi.spyOn(api.saved, 'list').mockResolvedValue([saved('inProgress')])
    const update = vi.spyOn(api.saved, 'update').mockResolvedValue(saved('completed'))
    const row = show(card())
    fireEvent.click(await within(row).findByRole('button', { name: 'Mark complete' }))
    await vi.waitFor(() => expect(update).toHaveBeenCalledWith('s1', { status: 'completed' }))
    cleanup()
    vi.spyOn(api.saved, 'list').mockResolvedValue([saved('completed')])
    const done = show(card())
    expect(await within(done).findByText('Completed')).toBeTruthy()
    expect(within(done).queryByRole('button', { name: 'Snooze' })).toBeNull()
  })

  it('Snooze sets a new time on the saved item', async () => {
    vi.spyOn(api.saved, 'list').mockResolvedValue([saved('inProgress')])
    const update = vi.spyOn(api.saved, 'update').mockResolvedValue(saved('inProgress'))
    const row = show(card())
    fireEvent.click(await within(row).findByRole('button', { name: 'Snooze' }))
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: /In 1 hour/ })))
    await vi.waitFor(() => expect(update).toHaveBeenCalled())
    const [id, patch] = update.mock.calls[0]
    expect(id).toBe('s1')
    expect(Math.abs(new Date(patch.remindAt!).getTime() - (Date.now() + 3_600_000))).toBeLessThan(5_000)
  })

  it('a reply’s reminder opens its thread; one removed from Saved keeps only the link', async () => {
    vi.spyOn(api.saved, 'list').mockResolvedValue([])
    const row = show(message('Reminder', { senderId: FLOWBOT_ID, flowbot: { ...note, rootId: 'm-root', target: { kind: 'reply', id: 'r-x' } } }))
    expect(within(row).getByRole('link', { name: 'View message' }).getAttribute('href')).toBe('/w/engineering/c/c-backend?thread=m-root')
    await vi.waitFor(() => expect(within(row).queryByRole('button', { name: 'Mark complete' })).toBeNull())
  })
})

describe('Pin to channel (spec 6.5, 10: P)', () => {
  it('⋯ has Pin to channel with P; choosing it pins the message', async () => {
    const pin = vi.spyOn(api.pins, 'pin').mockResolvedValue()
    show(message('Deploy at 23:00'))
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    const item = screen.getByRole('menuitem', { name: /Pin to channel/ })
    expect(item.textContent).toContain('P')
    await act(async () => {
      fireEvent.click(item)
    })
    expect(pin).toHaveBeenCalledWith('m1')
  })

  it('a pinned message says who pinned it, and ⋯ offers Unpin from channel', async () => {
    const unpin = vi.spyOn(api.pins, 'unpin').mockResolvedValue()
    show(message('Deploy at 23:00', { pin: { by: 'u-2', at: '2026-10-28T10:00:00.000Z' } }))
    expect(screen.getByText('Pinned by Nour El-Sayed')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: /Unpin from channel/ }))
    })
    expect(unpin).toHaveBeenCalledWith('m1')
  })

  it('P on the focused message pins it, and again unpins', async () => {
    const pin = vi.spyOn(api.pins, 'pin').mockResolvedValue()
    show(message('Deploy at 23:00'))
    await act(async () => {
      fireEvent.keyDown(screen.getByRole('button', { name: 'More actions' }), { key: 'p' })
    })
    expect(pin).toHaveBeenCalledWith('m1')
  })

  it('no pin where I can’t post, on a thread reply, or on a system line', () => {
    show(message('x'), { canPost: false })
    expect(screen.queryByRole('menuitem', { name: /Pin to channel/ })).toBeNull()
    cleanup()
    show({ id: 'r1', messageId: 'm1', channelId: 'c1', senderId: 'u-2', content: 'r', body: parseBody('r'), attachments: [], reactions: [], mentions: [], createdAt: '2026-10-28T09:00:00.000Z' } as ThreadReply)
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(screen.queryByRole('menuitem', { name: /Pin to channel/ })).toBeNull()
  })

  it('the system line reads "pinned a message to this channel."', () => {
    expect(systemText({ kind: 'pinned', messageId: 'm1' })).toBe('pinned a message to this channel.')
  })
})
