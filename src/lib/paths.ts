import type { Channel } from '@/api/types'
import type { ProjectView } from '@/lib/uiStore'

/** Every route of the app in one place, so a link and its route cannot drift apart. */
export const paths = {
  workspace: (ws: string) => `/w/${ws}`,
  channel: (ws: string, id: string) => `/w/${ws}/c/${id}`,
  project: (ws: string, key: string, view: ProjectView = 'board') => `/w/${ws}/p/${key}/${view}`,
  settings: (ws: string) => `/w/${ws}/settings`,
}

/** The place last visited in a workspace, if the saved path really is inside it. */
export function savedPlace(workspaceSlug: string, lastVisited: Record<string, string>): string | undefined {
  const saved = lastVisited[workspaceSlug]
  return saved?.startsWith(`${paths.workspace(workspaceSlug)}/`) ? saved : undefined
}

/**
 * Where opening a workspace lands: the place last visited in it, else #general, else its first channel,
 * else Settings (a workspace with no channels still has somewhere to go).
 */
export function landingPath(workspaceSlug: string, lastVisited: Record<string, string>, channels: Channel[]): string {
  const saved = savedPlace(workspaceSlug, lastVisited)
  if (saved) return saved
  const target =
    channels.find((c) => c.kind === 'channel' && c.name === 'general') ??
    channels.find((c) => c.kind === 'channel') ??
    channels[0]
  return target ? paths.channel(workspaceSlug, target.id) : paths.settings(workspaceSlug)
}
