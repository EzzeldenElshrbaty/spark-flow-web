// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ActivityItem } from '@/api/types'
import { ActivityView } from '@/pages/chat/ActivityView'

afterEach(cleanup)

let n = 0
const item = (over: Partial<ActivityItem> = {}): ActivityItem => ({
  id: `a${++n}`, kind: 'mention', read: false, createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString(), workspaceId: 'ws-eng', actorId: 'u-2',
  actorName: 'Nour El-Sayed', channelId: 'c-backend', messageId: 'm1', replyId: null, taskKey: null, projectId: null, excerpt: 'Can you look at this?', emoji: null, ...over,
})
const mention = item({ id: 'mention', excerpt: 'Ping on the release' })
const reaction = item({ id: 'reaction', kind: 'reaction', emoji: '👍', read: true, actorName: 'Omar Hassan', excerpt: 'Shipped the fix' })
const thread = item({ id: 'thread', kind: 'thread', replyId: 'r1', excerpt: 'Merged it' })

type Props = Partial<ComponentProps<typeof ActivityView>>
function show(props: Props = {}, at = '/w/engineering/activity') {
  const handlers = { onOpen: vi.fn(), onMarkAllRead: vi.fn(), onRetry: vi.fn() }
  render(
    <MemoryRouter initialEntries={[at]}>
      <ActivityView items={[mention, reaction, thread]} ws="engineering" placeOf={() => '#backend'} error={false} retrying={false} marking={false} markError={null} {...handlers} {...props} />
    </MemoryRouter>,
  )
  return handlers
}
/** A row's text as it's read out (the decorative avatar's initials left out). */
const spoken = (el: Element) => {
  const copy = el.cloneNode(true) as Element
  copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove())
  return copy.textContent
}
const rowNames = (list: string) => within(screen.getByRole('list', { name: list })).getAllByRole('link').map(spoken)

describe('Activity (spec 6.12)', () => {
  it('has its title, the tabs, Unread only and Mark all read', () => {
    show()
    expect(screen.getByRole('heading', { level: 1, name: 'Activity' })).toBeTruthy()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['All', 'Mentions', 'Tasks', 'Reactions', 'Threads', 'Reminders'])
    expect(screen.getByRole('tab', { name: 'All' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('switch', { name: 'Unread only' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('button', { name: 'Mark all read' })).toBeTruthy()
  })

  it('lists the unread rows, then the read ones under Earlier, each with its kind line, who, the text and the time', () => {
    show()
    expect(rowNames('Unread')).toEqual([
      'Unread, Mentioned you in #backendNour El-Sayed Ping on the release3h ago',
      'Unread, Replied in a thread you follow in #backendNour El-Sayed Merged it3h ago',
    ])
    expect(screen.getByRole('heading', { level: 2, name: 'Earlier' })).toBeTruthy()
    // A reaction's text is my message: the line says who reacted, and no name sits in front of my words.
    expect(rowNames('Earlier')).toEqual(['Omar Hassan reacted 👍 to your message in #backendShipped the fix3h ago'])
  })

  it('opening a row goes to it and tells the page, to mark it read', () => {
    const { onOpen } = show()
    const row = screen.getByRole('link', { name: /Ping on the release/ })
    expect(row.getAttribute('href')).toBe('/w/engineering/c/c-backend?message=m1')
    fireEvent.click(row)
    expect(onOpen).toHaveBeenCalledWith(mention)
  })

  it('a tab shows its kind; arrow keys move between tabs', () => {
    show()
    fireEvent.click(screen.getByRole('tab', { name: 'Reactions' }))
    expect(screen.queryByRole('list', { name: 'Unread' })).toBeNull()
    expect(rowNames('Earlier')).toHaveLength(1)
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Reactions' }), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Threads' }).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Threads' }))
    expect(rowNames('Unread')).toEqual([expect.stringContaining('Merged it')])
  })

  it('Unread only leaves Earlier out, and says when all is read', () => {
    show()
    fireEvent.click(screen.getByRole('switch', { name: 'Unread only' }))
    expect(screen.queryByRole('heading', { name: 'Earlier' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Reactions' }))
    expect(screen.getByText('You’re all caught up.')).toBeTruthy()
  })

  it('an empty tab says so', () => {
    show({ items: [reaction] })
    fireEvent.click(screen.getByRole('tab', { name: 'Mentions' }))
    expect(screen.getByText('Nothing here yet.')).toBeTruthy()
  })

  it('Mark all read marks everything on All, and only what the tab shows elsewhere; with nothing unread it is off', () => {
    const { onMarkAllRead } = show({ items: [mention, reaction, thread, item({ id: 'mention2' })] })
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    expect(onMarkAllRead).toHaveBeenLastCalledWith(undefined)
    fireEvent.click(screen.getByRole('tab', { name: 'Mentions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    expect(onMarkAllRead).toHaveBeenLastCalledWith(['mention', 'mention2'])
    fireEvent.click(screen.getByRole('tab', { name: 'Reactions' }))
    expect((screen.getByRole('button', { name: 'Mark all read' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('while marking it says so, and a failure is said beside it', () => {
    show({ marking: true, markError: "Couldn't mark them read. Try again." })
    expect((screen.getByRole('button', { name: 'Marking…' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('alert').textContent).toBe("Couldn't mark them read. Try again.")
  })

  it('a task comment names the task and opens it', () => {
    show({ items: [item({ channelId: null, messageId: null, taskKey: 'NEX-12', projectId: 'p1', excerpt: 'Review please' })], placeOf: () => null })
    const row = screen.getByRole('link', { name: /Review please/ })
    expect(row.textContent).toContain('Mentioned you on NEX-12')
    expect(row.getAttribute('href')).toBe('/w/engineering/p/NEX/tasks?ticket=NEX-12')
  })

  it('its times move on while the page stays open', () => {
    vi.useFakeTimers({ now: new Date('2026-10-28T12:00:00.000Z') })
    try {
      show({ items: [item({ createdAt: '2026-10-28T12:00:00.000Z', excerpt: 'Fresh' })] })
      const row = () => screen.getByRole('link', { name: /Fresh/ }).textContent
      expect(row()).toContain('just now')
      act(() => vi.advanceTimersByTime(3 * 60_000))
      expect(row()).toContain('3 min ago')
    } finally {
      vi.useRealTimers()
    }
  })

  it('pulses while it loads, and offers Try again when it fails', () => {
    show({ items: undefined })
    expect(screen.getByRole('tabpanel').getAttribute('aria-busy')).toBe('true')
    cleanup()
    const { onRetry } = show({ items: undefined, error: true })
    expect(screen.getByText('Activity didn’t load.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})

describe('Activity header (spec 6.12, .sf-view-head)', () => {
  it('is padded 16px at the end, like the start on phones', () => {
    show()
    const head = document.querySelector('header')!
    expect(head.className.split(' ')).toContain('pe-4')
    expect(head.className.split(' ')).not.toContain('pe-3')
  })
})

describe('Activity reminders (spec 6.12 Reminders tab)', () => {
  it('a fired reminder is Flowbot’s, under Reminders, with the message’s text', async () => {
    const reminder = item({ id: 'rem', kind: 'reminder', actorId: 'app-flowbot', actorName: 'Flowbot', excerpt: 'Review the release notes' })
    show({ items: [mention, reminder] })
    await act(async () => fireEvent.click(screen.getByRole('tab', { name: 'Reminders' })))
    const [row] = within(screen.getByRole('list', { name: 'Unread' })).getAllByRole('link')
    expect(spoken(row)).toContain('Reminder about a message in #backend')
    expect(spoken(row)).toContain('Review the release notes')
    expect(row.querySelector('.bg-sf-ink-950')).not.toBeNull()
  })
})

describe('the tab is in the address (UX Phase 2, 2.7)', () => {
  it('opens on the tab the address names, so a reload or a shared link keeps it', () => {
    show({}, '/w/engineering/activity?tab=thread')
    expect(screen.getByRole('tab', { name: /Threads/, selected: true })).toBeTruthy()
  })
})
