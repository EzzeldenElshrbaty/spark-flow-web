import { useLocation } from 'react-router'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { useUiStore } from '@/lib/uiStore'
import { modeOf, type WorkspaceMode } from '@/lib/workspaceMode'

/** The side of Flow on screen (spec 5.5): from the address, else the side last opened in this workspace, else Chat. */
export function useWorkspaceMode(): WorkspaceMode {
  const { pathname } = useLocation()
  const slug = useCurrentWorkspace().workspace?.slug
  const last = useUiStore((state) => (slug ? state.lastMode[slug] : undefined))
  return modeOf(pathname) ?? last ?? 'chat'
}
