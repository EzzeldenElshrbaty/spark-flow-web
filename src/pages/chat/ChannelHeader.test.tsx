// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Channel } from '@/api/types'
import { ChannelHeader, type ChannelHeaderProps } from '@/pages/chat/ChannelHeader'
import { ChannelTabs, channelTabs, tabFromParam } from '@/pages/chat/ChannelTabs'

afterEach(cleanup)

const backend: Channel = {
  id: 'c-backend', workspaceId: 'ws-eng', kind: 'channel', name: 'backend', topic: 'APIs and jobs', memberIds: ['u-1', 'u-2', 'u-3', 'u-4'],
  isPrivate: false, lastMessageAt: null, description: '', whoCanPost: 'everyone', isDefault: false, unreadCount: 2, lastSeq: 9, lastReadSeq: 7, starred: false, muted: false, notifyLevel: 'mentions', notifyLevelOwn: false,
}
const people = [
  { id: 'u-1', name: 'Youssef Abdelrahman' },
  { id: 'u-2', name: 'Nour El-Sayed' },
  { id: 'u-3', name: 'Mariam Fathy' },
  { id: 'u-4', name: 'Omar Hassan' },
]

function header(props: Partial<ChannelHeaderProps> = {}) {
  const handlers = {
    onDetails: vi.fn(), onStar: vi.fn(), onMute: vi.fn(), onNotifyLevel: vi.fn(), onMarkRead: vi.fn(), onCopyLink: vi.fn(async () => {}), onLeave: vi.fn(), onArchive: vi.fn(),
  }
  render(<ChannelHeader channel={backend} title="backend" members={people} rights={{ manage: true, leave: true, archive: true }} {...handlers} {...props} />)
  return handlers
}

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Channel actions' }))
const item = (name: string) => screen.getByRole('menuitem', { name })

describe('ChannelHeader search (spec 6.1)', () => {
  it('the search button opens Search in this channel', () => {
    const onSearch = vi.fn()
    header({ onSearch })
    fireEvent.click(screen.getByRole('button', { name: 'Search in channel' }))
    expect(onSearch).toHaveBeenCalledOnce()
  })
  it('no button where there is nothing to scope it to', () => {
    header()
    expect(screen.queryByRole('button', { name: /Search in/ })).toBeNull()
  })
})

describe('ChannelHeader (spec 6.1)', () => {
  it('names the channel in a heading; the name opens Channel details on About, for everyone who can read it (spec 6.1)', () => {
    const { onDetails } = header()
    expect(screen.getByRole('heading', { level: 1, name: 'backend' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'backend' }))
    expect(onDetails).toHaveBeenCalledWith('about')
    cleanup()
    const reader = header({ rights: { manage: false, leave: true, archive: false } })
    fireEvent.click(screen.getByRole('button', { name: 'backend' }))
    expect(reader.onDetails).toHaveBeenCalledWith('about')
  })

  it('shows the topic; an empty one offers "Add a topic", with its field open, only to whoever may change it', () => {
    header()
    expect(screen.getByText('APIs and jobs')).toBeTruthy()
    cleanup()
    const { onDetails } = header({ channel: { ...backend, topic: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add a topic' }))
    expect(onDetails).toHaveBeenCalledWith('about', true)
    cleanup()
    header({ channel: { ...backend, topic: '' }, rights: { manage: false, leave: false, archive: false } })
    expect(screen.queryByText('Add a topic')).toBeNull()
  })

  it('the star is a toggle button', () => {
    const { onStar } = header()
    const star = screen.getByRole('button', { name: 'Star channel' })
    expect(star.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(star)
    expect(onStar).toHaveBeenCalledWith(true)
    cleanup()
    const again = header({ channel: { ...backend, starred: true } })
    fireEvent.click(screen.getByRole('button', { name: 'Star channel' }))
    expect(again.onStar).toHaveBeenCalledWith(false)
  })

  it('the members button shows three faces and the count, and opens Members, for everyone', () => {
    const { onDetails } = header({ rights: { manage: false, leave: true, archive: false } })
    const members = screen.getByRole('button', { name: '4 members' })
    expect(members.querySelectorAll(':scope > span > [aria-hidden="true"]')).toHaveLength(3)
    expect(members.textContent).toMatch(/4 members$/)
    fireEvent.click(members)
    expect(onDetails).toHaveBeenCalledWith('members')
  })

  it('the more menu has channel details, copy link, mark all read, leave and archive (mute is under the bell)', () => {
    const h = header()
    openMenu()
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual(['Channel details', 'Notification settings', 'Copy link', 'Mark all read', 'Leave channel', 'Archive channel'])
    fireEvent.click(item('Channel details'))
    expect(h.onDetails).toHaveBeenCalledWith('about')
    openMenu()
    fireEvent.click(item('Mark all read'))
    expect(h.onMarkRead).toHaveBeenCalledOnce()
    openMenu()
    fireEvent.click(item('Leave channel'))
    expect(h.onLeave).toHaveBeenCalledOnce()
    openMenu()
    fireEvent.click(item('Archive channel'))
    expect(h.onArchive).toHaveBeenCalledOnce()
  })

  it('Archive is for Admins: someone who may manage the channel but isn’t one doesn’t see it (spec 6.1)', () => {
    header({ rights: { manage: true, leave: true, archive: false } })
    openMenu()
    expect(screen.queryByRole('menuitem', { name: 'Archive channel' })).toBeNull()
  })

  it('Notification settings in the more menu offers the bell’s levels and Mute (spec 6.1)', () => {
    const h = header()
    openMenu()
    fireEvent.click(item('Notification settings'))
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Nothing/ }))
    expect(h.onNotifyLevel).toHaveBeenCalledWith('none')
  })

  it('without rights the menu has channel details, copy link and mark all read; a read channel says so', () => {
    header({ channel: { ...backend, unreadCount: 0 }, rights: { manage: false, leave: false, archive: false } })
    openMenu()
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual(['Channel details', 'Notification settings', 'Copy link', 'Mark all read'])
    expect(item('Mark all read').getAttribute('aria-disabled')).toBe('true')
  })

  it('copy link says "Link copied" next to the menu, then clears', async () => {
    vi.useFakeTimers()
    try {
      const { onCopyLink } = header()
      openMenu()
      await act(async () => fireEvent.click(item('Copy link')))
      expect(onCopyLink).toHaveBeenCalledOnce()
      expect(screen.getByRole('status').textContent).toBe('Link copied')
      act(() => vi.advanceTimersByTime(2000))
      expect(screen.getByRole('status').textContent).toBe('')
    } finally {
      vi.useRealTimers()
    }
  })

  it("a copy the browser refuses says so instead", async () => {
    header({ onCopyLink: vi.fn(async () => Promise.reject(new Error('denied'))) })
    openMenu()
    await act(async () => fireEvent.click(item('Copy link')))
    expect(screen.getByRole('status').textContent).toBe("Couldn’t copy the link")
  })

  it('a DM is named after the person, with no members button, edit, leave or archive', () => {
    const dm: Channel = { ...backend, id: 'c-dm-1', kind: 'dm', name: null, topic: '', isPrivate: true, memberIds: ['u-1', 'u-2'] }
    header({ channel: dm, title: 'Nour El-Sayed', members: people.slice(0, 2), rights: { manage: false, leave: false, archive: false } })
    expect(screen.getByRole('heading', { level: 1, name: 'Nour El-Sayed' })).toBeTruthy()
    // No details for a DM yet: its name is plain text.
    expect(screen.queryByRole('button', { name: 'Nour El-Sayed' })).toBeNull()
    expect(screen.queryByRole('button', { name: /members$/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Star conversation' })).toBeTruthy()
    openMenu()
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual(['Notification settings', 'Copy link', 'Mark all read'])
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Conversation notifications' }))
    expect(screen.getByRole('menuitem', { name: 'Mute conversation' })).toBeTruthy()
  })
})

describe('the channel bell (spec 6.11)', () => {
  const openBell = () => fireEvent.click(screen.getByRole('button', { name: 'Channel notifications' }))
  const levels = () => screen.getAllByRole('menuitemradio').map((el) => [el.textContent, el.getAttribute('aria-checked')])

  it('asks "Notify me about" with Default (…) and the three levels, the one that applies checked, then Mute channel', () => {
    header()
    openBell()
    const menu = screen.getByRole('menu', { name: 'Channel notifications' })
    expect(menu.textContent).toMatch(/^Notify me about/)
    expect(levels()).toEqual([['Default (Mentions and keywords)', 'true'], ['All new messages', 'false'], ['Mentions and keywords', 'false'], ['Nothing', 'false']])
    expect(menu.querySelector('[role="separator"]')).toBeTruthy()
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual(['Mute channel'])
  })

  it('picking a level sets it and closes the menu; picking the current one changes nothing', () => {
    const { onNotifyLevel } = header()
    openBell()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Nothing' }))
    expect(onNotifyLevel).toHaveBeenCalledWith('none')
    expect(screen.queryByRole('menu')).toBeNull()
    openBell()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Default (Mentions and keywords)' }))
    expect(onNotifyLevel).toHaveBeenCalledOnce()
  })

  it('a level of its own: that level is checked, and Default (…) goes back to my default (slice AA)', () => {
    const { onNotifyLevel } = header({ channel: { ...backend, notifyLevel: 'all', notifyLevelOwn: true } })
    openBell()
    expect(levels()).toEqual([['Default', 'false'], ['All new messages', 'true'], ['Mentions and keywords', 'false'], ['Nothing', 'false']])
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Default' }))
    expect(onNotifyLevel).toHaveBeenCalledWith(null)
  })

  it('Mute channel mutes it; a muted channel offers Unmute', () => {
    const { onMute } = header()
    openBell()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mute channel' }))
    expect(onMute).toHaveBeenCalledWith(true)
    cleanup()
    const again = header({ channel: { ...backend, muted: true } })
    fireEvent.click(screen.getByRole('button', { name: 'Channel notifications: muted' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unmute channel' }))
    expect(again.onMute).toHaveBeenCalledWith(false)
  })

  it('ends with "Desktop, mobile and email…", which opens Preferences; while Do Not Disturb is on, a note says until when', () => {
    const onOpen = vi.fn()
    header({ preferences: { dndEnd: null, onOpen } })
    openBell()
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual(['Mute channel', 'Desktop, mobile and email…'])
    // The spec's layout: a line before Mute, and one before the Do Not Disturb note when there is one.
    expect(screen.getByRole('menu').querySelectorAll('[role="separator"]')).toHaveLength(1)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Desktop, mobile and email…' }))
    expect(onOpen).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
    cleanup()
    header({ preferences: { dndEnd: '9:00 AM', onOpen } })
    openBell()
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual(['Mute channel', 'Desktop, mobile and email…', 'Do Not Disturb until 9:00 AM'])
    expect(screen.getByRole('menu').querySelectorAll('[role="separator"]')).toHaveLength(2)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Do Not Disturb until 9:00 AM' }))
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it('Notification settings in the more menu has them too', () => {
    header({ preferences: { dndEnd: '9:00 AM', onOpen: vi.fn() } })
    openMenu()
    fireEvent.click(item('Notification settings'))
    expect(screen.getByRole('menuitem', { name: 'Do Not Disturb until 9:00 AM' })).toBeTruthy()
  })
})

describe('channel tabs (spec 6.1)', () => {
  it('a channel has Messages, Files, Pins and Page; a DM has no Page', () => {
    expect(channelTabs(backend).map((t) => t.id)).toEqual(['messages', 'files', 'pins', 'page'])
    expect(channelTabs({ ...backend, kind: 'dm' }).map((t) => t.id)).toEqual(['messages', 'files', 'pins'])
  })

  it('an unknown or unavailable tab in the URL reads as Messages', () => {
    expect(tabFromParam('files', backend)).toBe('files')
    expect(tabFromParam(null, backend)).toBe('messages')
    expect(tabFromParam('nope', backend)).toBe('messages')
    expect(tabFromParam('page', { ...backend, kind: 'dm' })).toBe('messages')
  })

  it('is a tablist; arrow keys move to and select the next tab, wrapping', () => {
    const onChange = vi.fn()
    render(<ChannelTabs channel={backend} tab="messages" onChange={onChange} panelId="panel" />)
    const tabs = screen.getAllByRole('tab')
    expect(screen.getByRole('tablist', { name: 'Channel views' })).toBeTruthy()
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false'])
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1, -1])
    expect(tabs[0].getAttribute('aria-controls')).toBe('panel')
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('files', { keys: true })
    expect(document.activeElement).toBe(tabs[1])
    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith('page', { keys: true })
    fireEvent.click(tabs[2])
    expect(onChange).toHaveBeenLastCalledWith('pins')
  })

  it('its name says when the channel is muted or set to Nothing, as its crossed-out bell shows', () => {
    header({ channel: { ...backend, notifyLevel: 'none', notifyLevelOwn: false } })
    expect(screen.getByRole('button', { name: 'Channel notifications: nothing' })).toBeTruthy()
    cleanup()
    header({ channel: { ...backend, notifyLevel: 'none', notifyLevelOwn: false, muted: true } })
    expect(screen.getByRole('button', { name: 'Channel notifications: muted' })).toBeTruthy()
    cleanup()
    const dm: Channel = { ...backend, id: 'c-dm-1', kind: 'dm', name: null, topic: '', isPrivate: true, memberIds: ['u-1', 'u-2'], muted: true }
    header({ channel: dm, title: 'Nour El-Sayed', members: people.slice(0, 2), rights: { manage: false, leave: false, archive: false } })
    fireEvent.click(screen.getByRole('button', { name: 'Conversation notifications: muted' }))
    expect(screen.getByRole('menu', { name: 'Conversation notifications' })).toBeTruthy()
  })
})
