import { useMatch } from 'react-router'
import { useWorkspaces } from '@/api/workspaces'
import { useUiStore } from '@/lib/uiStore'

/**
 * The workspace the shell is showing: the one in the URL, else the last one opened, else the first.
 * Each is checked against the real list, so a stale slug never wins. Layout parents cannot read the child route's
 * params, so the slug comes from matching the URL.
 */
export function useCurrentWorkspace() {
  const inUrl = useMatch({ path: '/w/:ws', end: false })?.params.ws
  const lastWorkspace = useUiStore((state) => state.lastWorkspace)
  const { data: workspaces, isPending, isError } = useWorkspaces()
  const find = (slug: string | null | undefined) => (slug ? workspaces?.find((w) => w.slug === slug) : undefined)
  const workspace = find(inUrl) ?? find(lastWorkspace) ?? workspaces?.[0]
  return { workspace, workspaces: workspaces ?? [], isPending, isError }
}
