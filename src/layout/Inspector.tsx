import { useEffect, useRef } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { hasOpenLayer } from '@/components/sf/layers'
import { parseInspector, withInspector } from '@/lib/inspector'
import { watchDialogAtKeyDown } from '@/lib/keyStart'
import { FileInspector } from '@/pages/chat/files/FileInspector'
import { ThreadInspector } from '@/pages/chat/ThreadInspector'
import { TicketInspector } from '@/pages/projects/TicketInspector'

/** Typing in a field (a message, search) owns Escape; so does an open dialog or menu (it's above the panel). */
function escapeBelongsElsewhere(dialogAtKeyDown: boolean): boolean {
  const active = document.activeElement
  const typing = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement || (active instanceof HTMLElement && active.isContentEditable)
  return typing || dialogAtKeyDown || hasOpenLayer() || Boolean(document.querySelector('[aria-modal="true"], [role="menu"]'))
}

/**
 * Esc closes the panel unless something above it has the key (a menu, the emoji picker, a tooltip, a dialog), or a
 * field does; the panel then owns it, so the channel doesn't also mark read.
 */
export function onInspectorEscape(event: KeyboardEvent, close: () => void, dialogAtKeyDown = false) {
  if (event.key !== 'Escape' || event.defaultPrevented || escapeBelongsElsewhere(dialogAtKeyDown)) return
  event.preventDefault()
  close()
}

/** While the panel is open, Esc closes it (unless something else has the key). */
export function useInspectorEscape(open: boolean, close: () => void) {
  const latest = useRef(close)
  useEffect(() => {
    latest.current = close
  })
  useEffect(() => {
    if (!open) return
    // On the document, so it runs before the channel's keys (on window) and its Esc isn't also a mark read. A layer
    // opened after the panel has its own listener after this one: while one is open, the panel leaves Esc to it
    // (spec 10: the top-most layer first). A dialog that closes on the key is seen as it was when the key went down.
    const dialog = watchDialogAtKeyDown()
    const onKeyDown = (event: KeyboardEvent) => onInspectorEscape(event, () => latest.current(), dialog.open())
    document.addEventListener('keydown', onKeyDown)
    return () => {
      dialog.stop()
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])
}

/** The right-side panel for a thread, a ticket or a file. Opened and closed only through the URL (`?thread=`, `?ticket=`, `?file=`). */
export function Inspector() {
  const [params, setParams] = useSearchParams()
  const { pathname } = useLocation()
  const target = parseInspector(params)
  const open = target !== null

  const rest = withInspector(params, null).toString()
  const closeTo = rest ? `${pathname}?${rest}` : pathname
  const onClose = () => setParams(withInspector(params, null))

  useInspectorEscape(open, () => setParams((current) => withInspector(current, null)))

  if (!target) return null
  if (target.kind === 'file') return <FileInspector key={target.fileId} fileId={target.fileId} onClose={onClose} closeTo={closeTo} />
  return target.kind === 'thread' ? (
    <ThreadInspector key={target.messageId} messageId={target.messageId} onClose={onClose} closeTo={closeTo} />
  ) : (
    <TicketInspector key={target.key} ticketKey={target.key} onClose={onClose} closeTo={closeTo} />
  )
}
