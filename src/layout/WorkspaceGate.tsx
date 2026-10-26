import { useEffect } from 'react'
import { Navigate, Outlet, useLocation, useParams } from 'react-router'
import { useWorkspaces } from '@/api/workspaces'
import { PageSkeleton } from '@/layout/PageSkeleton'
import { paths } from '@/lib/paths'
import { useUiStore } from '@/lib/uiStore'

/** Route element of `/w/:ws`: an unknown workspace goes back to `/`; a known one shows its page and remembers the place. */
export function WorkspaceGate() {
  const { ws } = useParams()
  const { pathname } = useLocation()
  const { data: workspaces, isPending, isError } = useWorkspaces()
  const visit = useUiStore((state) => state.visit)
  const known = workspaces?.some((w) => w.slug === ws) ?? false

  useEffect(() => {
    // The bare workspace address only redirects; remembering it would overwrite the real last place.
    if (ws && known && pathname.startsWith(`${paths.workspace(ws)}/`)) visit(ws, pathname)
  }, [ws, known, pathname, visit])

  if (isPending) return <PageSkeleton />
  if (isError) return <p className="text-sm text-fg-muted">Spark Flow couldn’t load your workspaces. Refresh to try again.</p>
  if (!known) return <Navigate to="/" replace />
  return <Outlet />
}
