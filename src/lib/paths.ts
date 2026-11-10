import type { Channel, Project } from '@/api/types'

export type ProjectTab = 'overview' | 'tasks' | 'chat' | 'time' | 'history' | 'files'
export const projectTabs: readonly ProjectTab[] = ['overview', 'tasks', 'chat', 'time', 'history', 'files']
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
  // Where everyone lands (dashboard start): after signing in, from the logo, and on the Projects side with no last place.
  start: (ws: string) => `/w/${ws}/dashboard`,
  channel: (ws: string, id: string) => `/w/${ws}/c/${id}`,
  /** A permalink to one message: the channel opens on it (spec 6.2 jump). */
  message: (ws: string, channelId: string, messageId: string) => `/w/${ws}/c/${channelId}?message=${encodeURIComponent(messageId)}`,
  projects: (ws: string) => `/w/${ws}/projects`,
  tasks: (ws: string) => `/w/${ws}/tasks`,
  project: (ws: string, key: string, tab: ProjectTab = 'overview', q?: TasksQuery) => `/w/${ws}/p/${key}/${tab}${query(q)}`,
  settings: (ws: string) => `/w/${ws}/settings`,
  help: (ws: string, chapter?: string, section?: string | null) => `/w/${ws}/help${chapter ? `/${chapter}` : ''}${section ? `#${section}` : ''}`,
  database: (ws: string) => `/w/${ws}/settings/database`,
  rates: (ws: string) => `/w/${ws}/settings/rates`,
  /** Everyone in the company (slice 3); `person` opens someone, 'new' Add person. */
  users: (ws: string, person?: string) => `/w/${ws}/settings/users${person ? `?person=${encodeURIComponent(person)}` : ''}`,
  /** Archived projects, tasks and channels (slice 4). */
  archived: (ws: string) => `/w/${ws}/settings/archived`,
  attendance: (ws: string) => `/w/${ws}/settings/attendance`,
  /** Roles and what each may do (slice 1). */
  roles: (ws: string) => `/w/${ws}/settings/roles`,
  /** The audit log (slice 2); `entry` opens one entry. */
  audit: (ws: string, entry?: number) => `/w/${ws}/settings/audit${entry ? `?entry=${entry}` : ''}`,
  dashboard: (ws: string) => `/w/${ws}/dashboard`,
  timeCost: (ws: string) => `/w/${ws}/time`,
  teams: (ws: string) => `/w/${ws}/teams`,
  /** Mentions, reactions to mine and replies in threads I follow (spec 6.12). */
  activity: (ws: string) => `/w/${ws}/activity`,
  /** Threads I follow, unread first (spec 6.12). */
  threads: (ws: string) => `/w/${ws}/threads`,
  /** My notification preferences (spec 6.11). */
  preferences: (ws: string) => `/w/${ws}/preferences`,
  /** Search (spec 6.12) for a query as typed. */
  search: (ws: string, q = '') => `/w/${ws}/search${q ? `?q=${encodeURIComponent(q)}` : ''}`,
  saved: (ws: string) => `/w/${ws}/saved`,
  drafts: (ws: string) => `/w/${ws}/drafts`,
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

const PLACE = /^\/w\/[^/]+\/(?:c\/([^/]+)|p\/([^/]+)\/([^/?]+)(?:\?.*)?|settings(?:\/(?:database|rates|roles|audit|users|archived|attendance))?|projects|tasks|dashboard|time|teams|activity|threads|preferences|saved|drafts|help(?:\/[a-z0-9-]+)?)$/

/**
 * Whether a saved place still leads somewhere: a channel that is still in the list, a project that still exists on
 * one of its views, or Settings. Help and its chapters count too: they are on the Projects side (UX Phase 6). A removed channel or project (or a mangled path) would otherwise land on a dead end.
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
