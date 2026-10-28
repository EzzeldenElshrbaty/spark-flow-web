import { useCallback, useEffect, useRef } from 'react'
import { useLocation } from 'react-router'

/** Navigation state Reply in thread and T leave: the thread they open puts the caret in its reply box. */
export type ThreadNavState = { focus?: 'reply' } | null
export const replyState: ThreadNavState = { focus: 'reply' }

/**
 * The reply box's caret when the thread was opened to reply (Reply in thread, T): on arrival, and again each time
 * I ask while it's open. A ref for the element around the reply box; a thread opened any other way leaves focus be.
 */
export function useReplyFocus() {
  const location = useLocation()
  const wanted = (location.state as ThreadNavState)?.focus === 'reply'
  const box = useRef<HTMLElement | null>(null)
  const focus = (el: HTMLElement | null) => el?.querySelector<HTMLElement>('textarea, [contenteditable="true"]')?.focus()
  // Asked again while the reply box is already there: each ask is a new location.
  useEffect(() => {
    if (wanted) focus(box.current)
  }, [wanted, location.key])
  // The reply box comes once the thread has loaded.
  return useCallback(
    (el: HTMLElement | null) => {
      box.current = el
      if (wanted) focus(el)
    },
    [wanted],
  )
}
