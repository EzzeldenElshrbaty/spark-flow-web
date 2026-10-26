import { Navigate } from 'react-router'
import { useChannels } from '@/api/chat'
import { PageSkeleton } from '@/layout/PageSkeleton'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { landingPath } from '@/lib/paths'
import { useUiStore } from '@/lib/uiStore'

/** `/` and `/w/:ws`: send the person to where they were last in the workspace (else #general). */
export function LastVisitRedirect() {
  const { workspace, isPending, isError } = useCurrentWorkspace()
  const lastVisited = useUiStore((state) => state.lastVisited)
  const channels = useChannels(workspace?.id)

  if (isPending || (workspace && channels.isPending)) return <PageSkeleton />
  if (isError) return <p className="text-sm text-fg-muted">Spark Flow couldn’t load your workspaces. Refresh to try again.</p>
  if (!workspace) return <p className="text-sm text-fg-muted">You aren’t in a workspace yet.</p>
  // If the channels failed to load the list is empty, which lands on Settings: still a page that works.
  return <Navigate to={landingPath(workspace.slug, lastVisited, channels.data ?? [])} replace />
}
