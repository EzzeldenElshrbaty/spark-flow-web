// @vitest-environment jsdom
import { cleanup, render, renderHook } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Channel } from '@/api/types'
import { MenuPanel } from '@/components/ui/Menu'
import { onInspectorEscape } from '@/layout/Inspector'
import { CHANNEL_COMPOSER, useChannelKeys } from '@/pages/chat/useChannelKeys'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})
// jsdom has no matchMedia; MenuPanel asks it whether this is a phone.
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const channel = (id: string, unreadCount = 0): Channel => ({
  id, workspaceId: 'ws-eng', kind: 'channel', name: id, topic: '', memberIds: ['u-1'], isPrivate: false, lastMessageAt: null,
  unreadCount, lastSeq: 5, lastReadSeq: 5 - unreadCount, starred: false, muted: false, notifyLevel: 'all',
})
const order = [channel('a', 2), channel('b'), channel('c'), channel('d', 1)]

function setup(channelId = 'b') {
  const handlers = { onGo: vi.fn(), onMarkRead: vi.fn(), onMarkAllRead: vi.fn() }
  renderHook(() => useChannelKeys({ channelId, order, ...handlers }))
  return handlers
}

/** Presses a key on `target` (the page when none); returns whether something prevented it. */
function press(key: string, mods: KeyboardEventInit = {}, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

function field(html: string) {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.append(host)
  return host.querySelector<HTMLElement>('input, [contenteditable]')!
}

describe('useChannelKeys: Alt+↑/↓ (spec 10)', () => {
  it('opens the next or previous channel in the sidebar', () => {
    const { onGo } = setup()
    expect(press('ArrowDown', { altKey: true })).toBe(true)
    expect(onGo).toHaveBeenLastCalledWith('c')
    press('ArrowUp', { altKey: true })
    expect(onGo).toHaveBeenLastCalledWith('a')
  })

  it('with Shift, the next or previous unread one', () => {
    const { onGo } = setup()
    press('ArrowDown', { altKey: true, shiftKey: true })
    expect(onGo).toHaveBeenLastCalledWith('d')
    press('ArrowUp', { altKey: true, shiftKey: true })
    expect(onGo).toHaveBeenLastCalledWith('a')
  })

  it('opens nothing past either end', () => {
    const { onGo } = setup('a')
    press('ArrowUp', { altKey: true })
    expect(onGo).not.toHaveBeenCalled()
  })

  it('works while typing, in the composer or any other field', () => {
    const { onGo } = setup()
    press('ArrowDown', { altKey: true }, field('<input type="search">'))
    expect(onGo).toHaveBeenCalledWith('c')
  })
})

describe('useChannelKeys: Esc and Shift+Esc (spec 10)', () => {
  it('Esc marks the channel read, from the page or from its own composer', () => {
    const { onMarkRead } = setup()
    expect(press('Escape')).toBe(true)
    press('Escape', {}, field(`<div ${CHANNEL_COMPOSER}><div contenteditable="true"></div></div>`))
    expect(onMarkRead).toHaveBeenCalledTimes(2)
  })

  it('Esc while typing in another field (search, a link, a reply) is that field’s', () => {
    const { onMarkRead, onMarkAllRead } = setup()
    expect(press('Escape', {}, field('<input type="search">'))).toBe(false)
    press('Escape', { shiftKey: true }, field('<div contenteditable="true"></div>'))
    expect(onMarkRead).not.toHaveBeenCalled()
    expect(onMarkAllRead).not.toHaveBeenCalled()
  })

  it('Shift+Esc asks to mark everything read', () => {
    const { onMarkAllRead, onMarkRead } = setup()
    press('Escape', { shiftKey: true })
    expect(onMarkAllRead).toHaveBeenCalledOnce()
    expect(onMarkRead).not.toHaveBeenCalled()
  })
})

describe('useChannelKeys: what already has the key', () => {
  it('a key something used first (a layer closing, the autocomplete) is left alone', () => {
    const { onMarkRead, onGo } = setup()
    const first = (event: Event) => event.preventDefault()
    document.addEventListener('keydown', first)
    try {
      press('Escape')
      press('ArrowDown', { altKey: true })
    } finally {
      document.removeEventListener('keydown', first)
    }
    expect(onMarkRead).not.toHaveBeenCalled()
    expect(onGo).not.toHaveBeenCalled()
  })

  it('nothing happens while a dialog is open', () => {
    const { onMarkRead, onGo } = setup()
    field('<div role="dialog" aria-modal="true"><input></div>')
    press('Escape')
    press('ArrowDown', { altKey: true })
    expect(onMarkRead).not.toHaveBeenCalled()
    expect(onGo).not.toHaveBeenCalled()
  })

  it('nor while an input method is composing', () => {
    const { onMarkRead } = setup()
    press('Escape', { isComposing: true })
    expect(onMarkRead).not.toHaveBeenCalled()
  })

  it('Esc that closes the ⋯ menu closes only the menu', () => {
    const { onMarkRead } = setup()
    const onClose = vi.fn()
    function Open() {
      const trigger = useRef<HTMLButtonElement>(null)
      return (
        <>
          <button ref={trigger}>Message actions</button>
          <MenuPanel open onClose={onClose} triggerRef={trigger} label="Message actions">
            <button role="menuitem">Edit message</button>
          </MenuPanel>
        </>
      )
    }
    render(<Open />)
    press('Escape', {}, document.activeElement ?? document.body)
    expect(onClose).toHaveBeenCalledOnce()
    expect(onMarkRead).not.toHaveBeenCalled()
  })

  it('Esc that closes the thread or task panel closes only the panel', () => {
    const close = vi.fn()
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    onInspectorEscape(event, close)
    expect(close).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
  })
})
