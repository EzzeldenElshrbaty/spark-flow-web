import { useCallback, useEffect, useRef } from 'react'
import { useLocation } from 'react-router'

/** Navigation state Reply in thread and T leave: the thread they open puts the caret in its reply box. */
export type ThreadNavState = { focus?: 'reply' } | null
export const replyState: ThreadNavState = { focus: 'reply' }

const REPLY_BOX = 'textarea, [contenteditable="true"]'

/** Focuses the reply box with the caret at its end, after a saved draft, to carry on typing. */
function focusAtEnd(reply: HTMLElement) {
  reply.focus()
  if (reply instanceof HTMLTextAreaElement) return reply.setSelectionRange(reply.value.length, reply.value.length)
  const selection = window.getSelection()
  if (!selection) return
  let last: Node = reply
  while (last.lastChild) last = last.lastChild
  const range = document.createRange()
  if (last.nodeType === Node.TEXT_NODE) range.setStart(last, last.textContent?.length ?? 0)
  else {
    range.selectNodeContents(last.parentNode ?? reply)
    range.collapse(false)
  }
  selection.removeAllRanges()
  selection.addRange(range)
}

/**
 * The reply box's caret when the thread was opened to reply (Reply in thread, T): on arrival, and again each time
 * I ask while it's open. A ref for the element around the reply box; a thread opened any other way leaves focus be.
 * The box may come after the element (who may post is known once the channel has loaded): then it waits for it.
 */
export function useReplyFocus() {
  const location = useLocation()
  const wanted = (location.state as ThreadNavState)?.focus === 'reply'
  const box = useRef<HTMLElement | null>(null)
  const waiting = useRef<MutationObserver | null>(null)

  const focus = useCallback((el: HTMLElement | null) => {
    waiting.current?.disconnect()
    waiting.current = null
    if (!el) return
    const reply = el.querySelector<HTMLElement>(REPLY_BOX)
    if (reply) return focusAtEnd(reply)
    const observer = new MutationObserver(() => {
      const late = el.querySelector<HTMLElement>(REPLY_BOX)
      if (!late) return
      observer.disconnect()
      waiting.current = null
      focusAtEnd(late)
    })
    observer.observe(el, { childList: true, subtree: true })
    waiting.current = observer
  }, [])

  // Asked again while the thread is open: each ask is a new location.
  useEffect(() => {
    if (wanted) focus(box.current)
  }, [wanted, location.key, focus])
  useEffect(() => () => waiting.current?.disconnect(), [])

  return useCallback(
    (el: HTMLElement | null) => {
      box.current = el
      if (wanted) focus(el)
      else if (!el) focus(null)
    },
    [wanted, focus],
  )
}
