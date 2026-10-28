import { useEffect } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { parseInspector, withInspector } from '@/lib/inspector'
import { ThreadInspector } from '@/pages/chat/ThreadInspector'
import { TicketInspector } from '@/pages/projects/TicketInspector'

/** Typing in a field (a message, search) owns Escape; so does an open dialog. */
function escapeBelongsElsewhere(): boolean {
  const active = document.activeElement
  const typing = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement || (active instanceof HTMLElement && active.isContentEditable)
  return typing || Boolean(document.querySelector('[aria-modal="true"]'))
}

/** Esc closes the panel unless a field or a dialog has it; the panel then owns it, so the channel doesn't also mark read. */
export function onInspectorEscape(event: KeyboardEvent, close: () => void) {
  if (event.key !== 'Escape' || event.defaultPrevented || escapeBelongsElsewhere()) return
  event.preventDefault()
  close()
}

/** The right-side panel for a thread or a ticket. Opened and closed only through the URL (`?thread=` / `?ticket=`). */
export function Inspector() {
  const [params, setParams] = useSearchParams()
  const { pathname } = useLocation()
  const target = parseInspector(params)
  const open = target !== null

  const rest = withInspector(params, null).toString()
  const closeTo = rest ? `${pathname}?${rest}` : pathname
  const onClose = () => setParams(withInspector(params, null))

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => onInspectorEscape(event, () => setParams((current) => withInspector(current, null)))
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, setParams])

  if (!target) return null
  return target.kind === 'thread' ? (
    <ThreadInspector key={target.messageId} messageId={target.messageId} onClose={onClose} closeTo={closeTo} />
  ) : (
    <TicketInspector key={target.key} ticketKey={target.key} onClose={onClose} closeTo={closeTo} />
  )
}
