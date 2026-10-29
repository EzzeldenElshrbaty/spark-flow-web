import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { paths } from '@/lib/paths'

/**
 * Keys that work anywhere in a workspace (spec 10): ⌘/Ctrl+Shift+A opens Activity, also from inside a text box, as
 * nothing there uses it. A key something else already took is left alone.
 */
export function useAppShortcuts(workspaceSlug: string | undefined) {
  const navigate = useNavigate()
  useEffect(() => {
    if (!workspaceSlug) return
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.metaKey || event.ctrlKey) || !event.shiftKey || event.altKey || event.key.toLowerCase() !== 'a') return
      event.preventDefault()
      navigate(paths.activity(workspaceSlug))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [workspaceSlug, navigate])
}
