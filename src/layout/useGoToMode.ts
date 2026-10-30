import { useNavigate } from 'react-router'
import { useChannels } from '@/api/chat'
import { useProjects } from '@/api/tickets'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { useUiStore } from '@/lib/uiStore'
import { modeTarget, type WorkspaceMode } from '@/lib/workspaceMode'

/**
 * Going to a side of Flow (spec 5.5): its last place in this workspace while it still leads somewhere, else its start.
 * The switch, the G shortcuts and the phone bar all go through here. Returns false while there is nowhere to go yet.
 */
export function useGoToMode() {
  const navigate = useNavigate()
  const { workspace } = useCurrentWorkspace()
  const channels = useChannels(workspace?.id).data
  const projects = useProjects(workspace?.id).data
  const lastByMode = useUiStore((state) => state.lastByMode)
  return (mode: WorkspaceMode): boolean => {
    const target = workspace ? modeTarget(workspace.slug, mode, lastByMode, channels, projects) : undefined
    if (!target) return false
    navigate(target)
    return true
  }
}

/** Where a side opens, for a link (the phone bar): undefined while its list is still loading. */
export function useModeTarget(mode: WorkspaceMode): string | undefined {
  const { workspace } = useCurrentWorkspace()
  const channels = useChannels(workspace?.id).data
  const projects = useProjects(workspace?.id).data
  const lastByMode = useUiStore((state) => state.lastByMode)
  return workspace ? modeTarget(workspace.slug, mode, lastByMode, channels, projects) : undefined
}
