import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { paths } from '@/lib/paths'

/** ⌘/Ctrl+Shift and a key's place: where it goes. */
const KEYS: Record<string, (ws: string) => string> = { KeyA: paths.activity, KeyT: paths.threads }

/**
 * Keys that work anywhere in a workspace (spec 10): ⌘/Ctrl+Shift+A opens Activity and ⌘/Ctrl+Shift+T Threads (spec
 * 6.12; browsers that keep ⌘⇧T for reopening a tab never pass it on), also from inside a text box, as nothing there
 * uses them. By the key's place (`code`), so it works on any layout (Arabic too); not on a held key's
 * repeats, not while a dialog is open (it would leave it waiting), and not when something else already took it.
 */
export function useAppShortcuts(workspaceSlug: string | undefined) {
  const navigate = useNavigate()
  useEffect(() => {
    if (!workspaceSlug) return
    const onKey = (event: KeyboardEvent) => {
      const to = KEYS[event.code]
      if (!to || event.defaultPrevented || event.repeat || !(event.metaKey || event.ctrlKey) || !event.shiftKey || event.altKey) return
      if (document.querySelector('[aria-modal="true"]')) return
      event.preventDefault()
      navigate(to(workspaceSlug))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [workspaceSlug, navigate])
}
