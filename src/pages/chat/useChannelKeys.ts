import { useEffect, useRef } from 'react'
import type { Channel } from '@/api/types'
import { channelKey, stepChannel } from '@/pages/chat/channelKeys'

/** Marks the channel's own composer: Esc there still marks the channel read. */
export const CHANNEL_COMPOSER = 'data-channel-composer'

/** Typing in a field other than the channel's composer (search, a link, a reply, an edit): Esc is that field's. */
function typingElsewhere(target: EventTarget | null): boolean {
  const field = target instanceof Element ? target.closest('input, textarea, select, [contenteditable="true"]') : null
  return Boolean(field && !field.closest(`[${CHANNEL_COMPOSER}]`))
}

/**
 * The channel page's keys (spec 10): Alt+↑/↓ open the previous or next channel in the sidebar (with Shift, the
 * previous or next unread one), even while typing; Esc marks the channel read and Shift+Esc asks to mark everything
 * read, unless I'm typing in another field. Nothing while a dialog is open, or for a key something already used.
 */
export function useChannelKeys(options: { channelId: string; order: Channel[]; onGo: (channelId: string) => void; onMarkRead: () => void; onMarkAllRead: () => void }) {
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })
  useEffect(() => {
    // On window, so it runs after every listener on the document: by then a menu, tooltip, autocomplete or edit
    // that took the key has prevented it.
    const onKeyDown = (event: KeyboardEvent) => {
      const action = channelKey(event)
      if (!action || event.defaultPrevented || event.isComposing || document.querySelector('[aria-modal="true"]')) return
      const { channelId, order, onGo, onMarkRead, onMarkAllRead } = latest.current
      if (action === 'markRead' || action === 'markAllRead') {
        if (typingElsewhere(event.target)) return
        event.preventDefault()
        if (action === 'markRead') onMarkRead()
        else onMarkAllRead()
        return
      }
      event.preventDefault()
      const next = stepChannel(order, channelId, action === 'next' || action === 'nextUnread' ? 1 : -1, action === 'nextUnread' || action === 'previousUnread')
      if (next) onGo(next)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
