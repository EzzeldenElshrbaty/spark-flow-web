// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Channel, ChatMessage, Preferences, ThreadReply } from '@/api/types'
import { DesktopNotifier } from '@/layout/DesktopNotifier'
import { parseBody } from '@/lib/messageBody'

const navigate = vi.fn()
const listeners = { message: [] as ((m: ChatMessage) => void)[], reply: [] as ((r: ThreadReply) => void)[] }
let prefs: Preferences
let channels: Record<string, Channel>

vi.mock('react-router', async (original) => ({ ...(await original<typeof import('react-router')>()), useNavigate: () => navigate }))
vi.mock('@/lib/realtime', () => ({
  useRealtime: () => ({
    onMessageReceived: (cb: (m: ChatMessage) => void) => (listeners.message.push(cb), () => (listeners.message = listeners.message.filter((l) => l !== cb))),
    onReplyReceived: (cb: (r: ThreadReply) => void) => (listeners.reply.push(cb), () => (listeners.reply = listeners.reply.filter((l) => l !== cb))),
  }),
}))
vi.mock('@/layout/useCurrentWorkspace', () => ({
  useCurrentWorkspace: () => ({ workspace: { id: 'ws-eng', slug: 'engineering' }, workspaces: [{ id: 'ws-eng', slug: 'engineering' }, { id: 'ws-ops', slug: 'ops' }] }),
}))
vi.mock('@/api/notifyLookups', () => ({
  useNotifyLookups: () => lookups,
}))
const lookups = {
  me: async () => ({ id: 'u-1' }),
  preferences: async () => prefs,
  channel: async (id: string) => {
    if (!channels[id]) throw new Error('Not found')
    return channels[id]
  },
  people: async () => [{ id: 'u-1', name: 'Youssef Abdelrahman' }, { id: 'u-2', name: 'Nour El-Sayed' }],
  root: async (id: string) => ({ id, threadMuted: mutedRoots.has(id) }),
}
let mutedRoots = new Set<string>()

/** The browser's Notification, as far as the notifier uses it. */
class FakeNotification {
  static permission: NotificationPermission = 'granted'
  static shown: FakeNotification[] = []
  onclick: (() => void) | null = null
  close = vi.fn()
  title: string
  options: NotificationOptions
  constructor(title: string, options: NotificationOptions) {
    this.title = title
    this.options = options
    FakeNotification.shown.push(this)
  }
}

let hidden = true
const channel = (over: Partial<Channel> = {}): Channel => ({
  id: 'c-backend', workspaceId: 'ws-eng', kind: 'channel', name: 'backend', topic: '', memberIds: ['u-1', 'u-2'], isPrivate: false, lastMessageAt: null,
  description: '', whoCanPost: 'everyone', isDefault: false, unreadCount: 0, lastSeq: 1, lastReadSeq: 0, starred: false, muted: false,
  notifyLevel: 'mentions', notifyLevelOwn: false, ...over,
})
const message = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm-9', channelId: 'c-backend', senderId: 'u-2', content: 'hi @Youssef', body: parseBody('hi @Youssef'), seq: 9, attachments: [], reactions: [],
  threadCount: 0, lastReplyAt: null, linkedTicketKeys: [], mentions: [{ kind: 'user', id: 'u-1' }], editedAt: null, createdAt: new Date().toISOString(), ...over,
})
const reply = (over: Partial<ThreadReply> = {}): ThreadReply => ({
  id: 'r-3', messageId: 'm-1', channelId: 'c-backend', senderId: 'u-2', content: 'on it @Youssef', body: parseBody('on it @Youssef'), attachments: [], reactions: [],
  mentions: [{ kind: 'user', id: 'u-1' }], createdAt: new Date().toISOString(), ...over,
})
/** A live event arrives; the notifier reads what it needs (async) before it shows anything. */
const arrive = async (event: ChatMessage | ThreadReply) =>
  act(async () => {
    if ('messageId' in event) listeners.reply.forEach((l) => l(event))
    else listeners.message.forEach((l) => l(event as ChatMessage))
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

beforeEach(() => {
  vi.clearAllMocks()
  FakeNotification.shown = []
  FakeNotification.permission = 'granted'
  vi.stubGlobal('Notification', FakeNotification)
  hidden = true
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  vi.spyOn(document, 'hasFocus').mockImplementation(() => !hidden)
  vi.spyOn(window, 'focus').mockImplementation(() => {})
  prefs = {
    defaultLevel: 'mentions', keywords: [], desktop: true, push: true, emailDigest: 'daily', dndUntil: null,
    dndSchedule: { on: false, from: '18:00', to: '09:00', days: [0, 1, 2, 3, 4], tz: 'Africa/Cairo' },
    singleKeyShortcuts: true,
  }
  channels = { 'c-backend': channel() }
  mutedRoots = new Set()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('DesktopNotifier (spec 6.11 Delivery: desktop notifications)', () => {
  it('a mention while Flow is in the background: the channel, who said what; clicking it opens the message', async () => {
    render(<DesktopNotifier />)
    await arrive(message())
    expect(FakeNotification.shown).toHaveLength(1)
    const note = FakeNotification.shown[0]
    expect(note.title).toBe('#backend')
    expect(note.options).toMatchObject({ body: 'Nour El-Sayed: hi @Youssef', tag: 'm-9' })
    note.onclick!()
    expect(window.focus).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/w/engineering/c/c-backend?message=m-9')
    expect(note.close).toHaveBeenCalled()
  })

  it('a reply opens its thread', async () => {
    render(<DesktopNotifier />)
    await arrive(reply())
    const note = FakeNotification.shown[0]
    expect(note.title).toBe('Thread in #backend')
    note.onclick!()
    expect(navigate).toHaveBeenCalledWith('/w/engineering/c/c-backend?thread=m-1')
  })

  it('a reply in a thread I muted, at All: nothing unless it mentions me (slice AA)', async () => {
    channels['c-backend'] = channel({ notifyLevel: 'all' })
    mutedRoots = new Set(['m-1'])
    render(<DesktopNotifier />)
    await arrive(reply({ id: 'r-4', body: parseBody('looks fine'), mentions: [] }))
    expect(FakeNotification.shown).toHaveLength(0)
    await arrive(reply())
    expect(FakeNotification.shown).toHaveLength(1)
  })

  it('a DM in another workspace: the person, then the text, and it opens there', async () => {
    channels['c-dm'] = channel({ id: 'c-dm', workspaceId: 'ws-ops', kind: 'dm', name: null, notifyLevel: 'all' })
    render(<DesktopNotifier />)
    await arrive(message({ id: 'm-dm', channelId: 'c-dm', body: parseBody('lunch?'), mentions: [] }))
    const note = FakeNotification.shown[0]
    expect([note.title, note.options.body]).toEqual(['Nour El-Sayed', 'lunch?'])
    note.onclick!()
    expect(navigate).toHaveBeenCalledWith('/w/ops/c/c-dm?message=m-dm')
  })

  it('nothing while Flow is in front of me', async () => {
    hidden = false
    render(<DesktopNotifier />)
    await arrive(message())
    expect(FakeNotification.shown).toHaveLength(0)
  })

  it('nothing while another Flow tab is in front', async () => {
    render(<DesktopNotifier />)
    const other = new BroadcastChannel('spark-flow-front')
    other.postMessage({ tab: 'other-tab', front: true })
    await new Promise((resolve) => setTimeout(resolve, 20))
    await arrive(message())
    expect(FakeNotification.shown).toHaveLength(0)
    other.postMessage({ tab: 'other-tab', front: false })
    await new Promise((resolve) => setTimeout(resolve, 20))
    await arrive(message({ id: 'm-13' }))
    expect(FakeNotification.shown).toHaveLength(1)
    other.close()
  })

  it('nothing without the browser’s permission, or with desktop notifications off', async () => {
    FakeNotification.permission = 'denied'
    render(<DesktopNotifier />)
    await arrive(message())
    FakeNotification.permission = 'granted'
    prefs = { ...prefs, desktop: false }
    await arrive(message({ id: 'm-10' }))
    expect(FakeNotification.shown).toHaveLength(0)
  })

  it('nothing that doesn’t notify me (no mention at Mentions and keywords), and nothing from a channel I’m not in or can’t read', async () => {
    channels['c-other'] = channel({ id: 'c-other', memberIds: ['u-2', 'u-3'] })
    render(<DesktopNotifier />)
    await arrive(message({ body: parseBody('hello all'), mentions: [] }))
    await arrive(message({ id: 'm-11', channelId: 'c-other' }))
    await arrive(message({ id: 'm-12', channelId: 'c-gone' }))
    expect(FakeNotification.shown).toHaveLength(0)
  })

  it('stops listening once it’s gone', async () => {
    const { unmount } = render(<DesktopNotifier />)
    unmount()
    expect(listeners.message).toHaveLength(0)
    expect(listeners.reply).toHaveLength(0)
  })
})
