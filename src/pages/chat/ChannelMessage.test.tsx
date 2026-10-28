// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { Announcer } from '@/components/sf/Announcer'
import { ToastProvider } from '@/components/sf/Toast'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage, TaskRef, ThreadReply, User } from '@/api/types'
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

function show(
  m: ChatMessage | ThreadReply,
  opts: { continuation?: boolean; selected?: Selection; onMarkUnread?: () => Promise<unknown>; sendState?: 'sending' | 'failed' } = {},
) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter>
        <ChannelMessage
          message={m}
          users={users}
          ctx={ctx}
          meId="u-1"
          canPost
          continuation={opts.continuation ?? false}
          selected={opts.selected}
          onMarkUnread={opts.onMarkUnread}
          sendState={opts.sendState}
        />
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

  it('an add chip opens the emoji picker; picking one closes it', () => {
    show(message('hi', { reactions: [{ emoji: '👍', userIds: ['u-2'] }] }))
    fireEvent.click(screen.getByRole('button', { name: 'Add reaction' }))
    const picker = screen.getByRole('dialog', { name: 'Add reaction' })
    expect(picker.querySelector('input[type="search"]')).toBe(document.activeElement)
    fireEvent.click(screen.getAllByRole('button', { name: 'party popper' })[0])
    expect(screen.queryByRole('dialog', { name: 'Add reaction' })).toBeNull()
  })

  it('typing "e" in the picker searches; it does not start editing my message (keys bubble out of portals)', () => {
    show(message('mine', { senderId: 'u-1', reactions: [{ emoji: '👍', userIds: ['u-2'] }] }))
    fireEvent.click(screen.getByRole('button', { name: 'Add reaction' }))
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
    expect(screen.queryByRole('button', { name: 'Message actions' })).toBeNull()
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
  const actions = () => screen.getByRole('button', { name: 'Message actions' })
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

  it('in the open ⋯ menu, U picks Mark unread and closes the menu; the row’s other letters do nothing there', () => {
    const writeText = vi.fn(async () => {})
    clipboard(writeText)
    const onMarkUnread = vi.fn(async () => {})
    show(message('hi'), { onMarkUnread })
    fireEvent.click(actions())
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Mark unread' }), { key: 'l' })
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.getByRole('menu')).toBeTruthy()
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
      const more = screen.queryByRole('button', { name: 'Message actions' })
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
