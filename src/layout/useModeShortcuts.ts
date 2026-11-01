import { useEffect } from 'react'
import { useGoToMode } from '@/layout/useGoToMode'
import type { WorkspaceMode } from '@/lib/workspaceMode'

/** How long G waits for its second key. */
const SEQUENCE_MS = 1000

const SECOND: Record<string, WorkspaceMode> = { KeyP: 'projects', KeyC: 'chat' }

/** A text box, an editor or a list box: their letters are typing, not shortcuts. */
function typingIn(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"]') !== null)
}

/**
 * G then P opens the Projects side, G then C the Chat side (spec 5.5), within a second, by the keys' place (`code`)
 * so any layout works. Not while typing, with a modifier, on repeats or with a dialog open. Decided in the capture
 * phase, so the second key never reaches a focused message too (P there pins it).
 */
export function useModeShortcuts() {
  const goTo = useGoToMode()
  useEffect(() => {
    let armedAt = 0
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || typingIn(event.target) || document.querySelector('[aria-modal="true"]')) {
        armedAt = 0
        return
      }
      const side = SECOND[event.code]
      if (side && armedAt && event.timeStamp - armedAt <= SEQUENCE_MS) {
        armedAt = 0
        event.preventDefault()
        event.stopPropagation()
        goTo(side)
        return
      }
      armedAt = event.code === 'KeyG' ? event.timeStamp || Number.MIN_VALUE : 0
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [goTo])
}
