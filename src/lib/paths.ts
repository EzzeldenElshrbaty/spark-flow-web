import type { Channel, Project } from '@/api/types'
import type { ProjectView } from '@/lib/uiStore'

/** Every route of the app in one place, so a link and its route cannot drift apart. */
export const paths = {
  workspace: (ws: string) => `/w/${ws}`,
  channel: (ws: string, id: string) => `/w/${ws}/c/${id}`,
  project: (ws: string, key: string, view: ProjectView = 'board') => `/w/${ws}/p/${key}/${view}`,
  settings: (ws: string) => `/w/${ws}/settings`,
  database: (ws: string) => `/w/${ws}/settings/database`,
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

const PLACE = /^\/w\/[^/]+\/(?:c\/([^/]+)|p\/([^/]+)\/([^/]+)|settings)$/
const VIEWS: readonly string[] = ['board', 'backlog'] satisfies ProjectView[]

/**
 * Whether a saved place still leads somewhere: a channel that is still in the list, a project that still exists on
 * one of its views, or Settings. A removed channel or project (or a mangled path) would otherwise land on a dead end.
 */
export function validSavedPlace(path: string, channels: Channel[], projects: Project[]): boolean {
  const match = PLACE.exec(path)
  if (!match) return false
  const [, channelId, projectKey, view] = match
  if (channelId) return channels.some((c) => c.id === channelId)
  if (projectKey) return VIEWS.includes(view) && projects.some((p) => p.key === projectKey)
  return true
}
