import { useEffect, useRef } from 'react'
import type { Channel } from '@/api/types'
import { watchDialogAtKeyDown } from '@/lib/keyStart'
import { channelKey, stepChannel } from '@/pages/chat/channelKeys'

/** Marks the channel's own composer: the channel's keys still work there (it keeps its draft when I move on). */
export const CHANNEL_COMPOSER = 'data-channel-composer'

/**
 * Typing in a field other than the channel's composer (search, a link, a reply, an edit): the keys are that field's,
 * and a reply or an edit has no draft, so moving to another channel would lose it.
 */
function typingElsewhere(target: EventTarget | null): boolean {
  const field = target instanceof Element ? target.closest('input, textarea, select, [contenteditable="true"]') : null
  return Boolean(field && !field.closest(`[${CHANNEL_COMPOSER}]`))
}

/**
 * The channel page's keys (spec 10): Alt+↑/↓ open the previous or next channel in the sidebar (with Shift, the
 * previous or next unread one); Esc marks the channel read and Shift+Esc asks to mark everything read. From the page
 * or the channel's composer, not while I'm typing in another field. Nothing while a dialog is open, or for a key
 * something already used.
 */
export function useChannelKeys(options: { channelId: string; order: Channel[]; onGo: (channelId: string) => void; onMarkRead: () => void; onMarkAllRead: () => void }) {
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })
  useEffect(() => {
    // A dialog open when the key went down owns it, even one that closes on it without saying so.
    const dialog = watchDialogAtKeyDown()
    // On window, so it runs after every listener on the document: by then a menu, tooltip, autocomplete or edit
    // that took the key has prevented it.
    const onKeyDown = (event: KeyboardEvent) => {
      const action = channelKey(event)
      if (!action || event.defaultPrevented || event.isComposing || dialog.open() || typingElsewhere(event.target)) return
      const { channelId, order, onGo, onMarkRead, onMarkAllRead } = latest.current
      event.preventDefault()
      if (action === 'markRead') return onMarkRead()
      if (action === 'markAllRead') return onMarkAllRead()
      const next = stepChannel(order, channelId, action === 'next' || action === 'nextUnread' ? 1 : -1, action === 'nextUnread' || action === 'previousUnread')
      if (next) onGo(next)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      dialog.stop()
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}
