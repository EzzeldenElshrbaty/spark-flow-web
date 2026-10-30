import type { Channel, Project } from '@/api/types'

export type ProjectTab = 'overview' | 'tasks' | 'chat' | 'time' | 'history'
export const projectTabs: readonly ProjectTab[] = ['overview', 'tasks', 'chat', 'time', 'history']
/** The Tasks tab's own address bar state. */
export type TasksQuery = { view?: 'board' | 'list'; phase?: string; sprint?: string }

const query = (q: TasksQuery = {}) => {
  const params = new URLSearchParams(Object.entries(q).filter((entry): entry is [string, string] => Boolean(entry[1])))
  const text = params.toString()
  return text ? `?${text}` : ''
}

/** Every route of the app in one place, so a link and its route cannot drift apart. */
export const paths = {
  workspace: (ws: string) => `/w/${ws}`,
  home: (ws: string) => `/w/${ws}`, // Home / My day is the workspace's own page
  channel: (ws: string, id: string) => `/w/${ws}/c/${id}`,
  /** A permalink to one message: the channel opens on it (spec 6.2 jump). */
  message: (ws: string, channelId: string, messageId: string) => `/w/${ws}/c/${channelId}?message=${encodeURIComponent(messageId)}`,
  projects: (ws: string) => `/w/${ws}/projects`,
  tasks: (ws: string) => `/w/${ws}/tasks`,
  project: (ws: string, key: string, tab: ProjectTab = 'overview', q?: TasksQuery) => `/w/${ws}/p/${key}/${tab}${query(q)}`,
  settings: (ws: string) => `/w/${ws}/settings`,
  database: (ws: string) => `/w/${ws}/settings/database`,
  rates: (ws: string) => `/w/${ws}/settings/rates`,
  dashboard: (ws: string) => `/w/${ws}/dashboard`,
  timeCost: (ws: string) => `/w/${ws}/time`,
  teams: (ws: string) => `/w/${ws}/teams`,
  /** Mentions, reactions to mine and replies in threads I follow (spec 6.12). */
  activity: (ws: string) => `/w/${ws}/activity`,
  saved: (ws: string) => `/w/${ws}/saved`,
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

const PLACE = /^\/w\/[^/]+\/(?:c\/([^/]+)|p\/([^/]+)\/([^/?]+)(?:\?.*)?|settings(?:\/(?:database|rates))?|projects|tasks|dashboard|time|teams|activity|saved)$/

/**
 * Whether a saved place still leads somewhere: a channel that is still in the list, a project that still exists on
 * one of its views, or Settings. A removed channel or project (or a mangled path) would otherwise land on a dead end.
 */
export function validSavedPlace(path: string, channels: Channel[], projects: Project[]): boolean {
  const match = PLACE.exec(path)
  if (!match) return false
  const [, channelId, projectKey, view] = match
  if (channelId) return channels.some((c) => c.id === channelId)
  if (projectKey) return (projectTabs as readonly string[]).includes(view) && projects.some((p) => p.key === projectKey)
  return true
}

const LEGACY = /^(\/w\/[^/]+\/p\/[^/]+)(?:\/(board|backlog))?\/?$/

/** Phase 1+2 project addresses, mapped to the new tabs: board and backlog are now the Tasks tab's views. */
export function legacyProjectPath(path: string): string | null {
  const match = LEGACY.exec(path)
  if (!match) return null
  const [, base, view] = match
  if (view === 'board') return `${base}/tasks?view=board`
  if (view === 'backlog') return `${base}/tasks?view=list`
  return `${base}/overview`
}
