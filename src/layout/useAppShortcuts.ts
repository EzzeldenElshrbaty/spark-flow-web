import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { paths } from '@/lib/paths'

/**
 * Keys that work anywhere in a workspace (spec 10): ⌘/Ctrl+Shift+A opens Activity, also from inside a text box, as
 * nothing there uses it. By the key's place (`code`), so it works on any layout (Arabic too); not on a held key's
 * repeats, not while a dialog is open (it would leave it waiting), and not when something else already took it.
 */
export function useAppShortcuts(workspaceSlug: string | undefined) {
  const navigate = useNavigate()
  useEffect(() => {
    if (!workspaceSlug) return
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || !(event.metaKey || event.ctrlKey) || !event.shiftKey || event.altKey || event.code !== 'KeyA') return
      if (document.querySelector('[aria-modal="true"]')) return
      event.preventDefault()
      navigate(paths.activity(workspaceSlug))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [workspaceSlug, navigate])
}
