import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { create } from 'zustand'
import { qk } from '@/api/queryKeys'
import type { SidebarOrder, SidebarSection } from '@/api/types'
import { api } from '@/lib/api'

/** Drops still saving, by workspace and section: what the sidebar shows over the server's copy until it lands. */
const usePending = create<{ byWs: Record<string, Partial<SidebarOrder>> }>(() => ({ byWs: {} }))
const setPending = (ws: string, section: SidebarSection, ids: string[] | null) =>
  usePending.setState((s) => {
    const mine = { ...s.byWs[ws] }
    if (ids) mine[section] = ids
    else delete mine[section]
    return { byWs: { ...s.byWs, [ws]: mine } }
  })

/**
 * My order of Starred, Channels and Projects in a workspace (spec 5.1) as the sidebar shows it: the server's, with any drop still
 * saving on top, so nothing jumps back while it saves (another drop's reload included). Not asked again on failure: the
 * sidebar falls back to the default order rather than wait.
 */
export function useShownSidebarOrder(workspaceId: string | undefined) {
  const query = useQuery({ queryKey: qk.sidebarOrder(workspaceId ?? ''), queryFn: () => api.sidebar.order(workspaceId!), enabled: Boolean(workspaceId), retry: false })
  const pending = usePending((s) => (workspaceId ? s.byWs[workspaceId] : undefined))
  const data = query.data && { starred: pending?.starred ?? query.data.starred, channels: pending?.channels ?? query.data.channels, projects: pending?.projects ?? query.data.projects }
  return { data, isPending: query.isPending && query.fetchStatus !== 'idle' }
}

/**
 * Saving a section's order after a drop or Sort A–Z: it shows at once and stays until the server's copy has it. Only
 * the latest save of a section decides: an older one landing or failing changes nothing on screen; the latest failing
 * puts the server's order back, and `error` names its section until the next save there works.
 */
export function useSaveSidebarOrder(workspaceId: string | undefined) {
  const mutation = useMutation({
    mutationFn: ({ ws, section, ids }: { ws: string; section: SidebarSection; ids: string[] }) => api.sidebar.setOrder(ws, section, ids),
  })
  const [error, setError] = useState<SidebarSection | null>(null)
  const save = (section: SidebarSection, ids: string[]) => {
    if (!workspaceId) return
    const ws = workspaceId
    setPending(ws, section, ids)
    // Still the latest drop of this section? (A newer one owns what shows, and its own outcome.)
    const latest = () => usePending.getState().byWs[ws]?.[section] === ids
    // By promise, not by `mutate` options: those only run for the latest call.
    mutation.mutateAsync({ ws, section, ids }).then(
      () => {
        if (!latest()) return
        setPending(ws, section, null)
        setError((e) => (e === section ? null : e))
      },
      () => {
        if (!latest()) return
        setPending(ws, section, null)
        setError(section)
      },
    )
  }
  return { save, error }
}
