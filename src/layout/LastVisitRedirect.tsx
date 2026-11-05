import { Navigate } from 'react-router'
import { PageSkeleton } from '@/layout/PageSkeleton'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { paths } from '@/lib/paths'

/** `/`: the last workspace you had open (else the first), on its start page, the Dashboard. */
export function LastVisitRedirect() {
  const { workspace, isPending, isError } = useCurrentWorkspace()
  if (isPending) return <PageSkeleton />
  if (isError) return <p className="text-sm text-fg-muted">Spark Flow couldn’t load your workspaces. Refresh to try again.</p>
  if (!workspace) return <p className="text-sm text-fg-muted">You aren’t in a workspace yet.</p>
  return <Navigate to={paths.start(workspace.slug)} replace />
}
