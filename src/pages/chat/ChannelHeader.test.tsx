// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Channel } from '@/api/types'
import { ChannelHeader, type ChannelHeaderProps } from '@/pages/chat/ChannelHeader'
import { ChannelTabs, channelTabs, tabFromParam } from '@/pages/chat/ChannelTabs'

afterEach(cleanup)

const backend: Channel = {
  id: 'c-backend', workspaceId: 'ws-eng', kind: 'channel', name: 'backend', topic: 'APIs and jobs', memberIds: ['u-1', 'u-2', 'u-3', 'u-4'],
  isPrivate: false, lastMessageAt: null, unreadCount: 2, lastSeq: 9, lastReadSeq: 7, starred: false, muted: false, notifyLevel: 'mentions',
}
const people = [
  { id: 'u-1', name: 'Youssef Abdelrahman' },
  { id: 'u-2', name: 'Nour El-Sayed' },
  { id: 'u-3', name: 'Mariam Fathy' },
  { id: 'u-4', name: 'Omar Hassan' },
]

function header(props: Partial<ChannelHeaderProps> = {}) {
  const handlers = {
    onEdit: vi.fn(), onStar: vi.fn(), onMute: vi.fn(), onNotifyLevel: vi.fn(), onMarkRead: vi.fn(), onCopyLink: vi.fn(async () => {}), onLeave: vi.fn(), onArchive: vi.fn(),
  }
  render(<ChannelHeader channel={backend} title="backend" members={people} rights={{ manage: true, leave: true }} {...handlers} {...props} />)
  return handlers
}

const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Channel actions' }))
const item = (name: string) => screen.getByRole('menuitem', { name })

describe('ChannelHeader (spec 6.1)', () => {
  it('names the channel in a heading; the name opens its details for whoever may change it', () => {
    const { onEdit } = header()
    expect(screen.getByRole('heading', { level: 1, name: 'backend' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'backend' }))
    expect(onEdit).toHaveBeenCalledOnce()
  })

  it('the name is plain text for someone who may not change the channel', () => {
    header({ rights: { manage: false, leave: true } })
    expect(screen.getByRole('heading', { level: 1, name: 'backend' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'backend' })).toBeNull()
  })

  it('shows the topic; an empty one offers "Add a topic" only to whoever may change it', () => {
    header()
    expect(screen.getByText('APIs and jobs')).toBeTruthy()
    cleanup()
    const { onEdit } = header({ channel: { ...backend, topic: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add a topic' }))
    expect(onEdit).toHaveBeenCalledOnce()
    cleanup()
    header({ channel: { ...backend, topic: '' }, rights: { manage: false, leave: false } })
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

  it('the members button shows three faces and the count', () => {
    const { onEdit } = header()
    const members = screen.getByRole('button', { name: '4 members' })
    expect(members.querySelectorAll(':scope > span > [aria-hidden="true"]')).toHaveLength(3)
    expect(members.textContent).toMatch(/4 members$/)
    fireEvent.click(members)
    expect(onEdit).toHaveBeenCalledOnce()
  })

  it('the more menu has edit, copy link, mark all read, leave and archive (mute is under the bell)', () => {
    const h = header()
    openMenu()
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual(['Edit details', 'Copy link', 'Mark all read', 'Leave channel', 'Archive channel'])
    fireEvent.click(item('Mark all read'))
    expect(h.onMarkRead).toHaveBeenCalledOnce()
    openMenu()
    fireEvent.click(item('Leave channel'))
    expect(h.onLeave).toHaveBeenCalledOnce()
    openMenu()
    fireEvent.click(item('Archive channel'))
    expect(h.onArchive).toHaveBeenCalledOnce()
  })

  it('without rights the menu has only copy link and mark all read; a read channel says so', () => {
    header({ channel: { ...backend, unreadCount: 0 }, rights: { manage: false, leave: false } })
    openMenu()
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual(['Copy link', 'Mark all read'])
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
    expect(screen.getByRole('status').textContent).toBe("Couldn't copy the link")
  })

  it('a DM is named after the person, with no members button, edit, leave or archive', () => {
    const dm: Channel = { ...backend, id: 'c-dm-1', kind: 'dm', name: null, topic: '', isPrivate: true, memberIds: ['u-1', 'u-2'] }
    header({ channel: dm, title: 'Nour El-Sayed', members: people.slice(0, 2), rights: { manage: false, leave: false } })
    expect(screen.getByRole('heading', { level: 1, name: 'Nour El-Sayed' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /members$/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Star conversation' })).toBeTruthy()
    openMenu()
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual(['Copy link', 'Mark all read'])
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Conversation notifications' }))
    expect(screen.getByRole('menuitem', { name: 'Mute conversation' })).toBeTruthy()
  })
})

describe('the channel bell (spec 6.11)', () => {
  const openBell = () => fireEvent.click(screen.getByRole('button', { name: 'Channel notifications' }))
  const levels = () => screen.getAllByRole('menuitemradio').map((el) => [el.textContent, el.getAttribute('aria-checked')])

  it('asks "Notify me about" with the three levels, the channel’s own checked, then Mute channel', () => {
    header()
    openBell()
    const menu = screen.getByRole('menu', { name: 'Channel notifications' })
    expect(menu.textContent).toMatch(/^Notify me about/)
    expect(levels()).toEqual([['All new messages', 'false'], ['Mentions and keywords', 'true'], ['Nothing', 'false']])
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
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Mentions and keywords' }))
    expect(onNotifyLevel).toHaveBeenCalledOnce()
  })

  it('Mute channel mutes it; a muted channel offers Unmute', () => {
    const { onMute } = header()
    openBell()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Mute channel' }))
    expect(onMute).toHaveBeenCalledWith(true)
    cleanup()
    const again = header({ channel: { ...backend, muted: true } })
    openBell()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Unmute channel' }))
    expect(again.onMute).toHaveBeenCalledWith(false)
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
    expect(onChange).toHaveBeenLastCalledWith('files')
    expect(document.activeElement).toBe(tabs[1])
    fireEvent.keyDown(tabs[0], { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith('page')
    fireEvent.click(tabs[2])
    expect(onChange).toHaveBeenLastCalledWith('pins')
  })
})
