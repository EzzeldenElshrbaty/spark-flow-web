import { modeOf } from '@/lib/workspaceMode'

export type BottomTab = 'dashboard' | 'projects' | 'chat' | 'more'

const DASHBOARD = /^\/w\/[^/]+\/dashboard\/?$/
const PROJECTS = /^\/w\/[^/]+\/(?:projects|p\/.+)\/?$/
/** What the phone's More holds: My work (the workspace's own address, and /tasks that leads to it), Time, Teams, Settings, Preferences, Help. */
const MORE = /^\/w\/[^/]+(?:\/(?:tasks|time|teams|preferences|settings(?:\/.+)?|help(?:\/.+)?))?\/?$/

/**
 * The phone bar's tab for a page: the one that holds it (UX Phase 5B, 5.2). My work and the other More pages mark More,
 * not Projects; a page under no tab (Search) marks none.
 */
export function bottomTab(pathname: string): BottomTab | null {
  if (DASHBOARD.test(pathname)) return 'dashboard'
  if (PROJECTS.test(pathname)) return 'projects'
  if (modeOf(pathname) === 'chat') return 'chat'
  if (MORE.test(pathname)) return 'more'
  return null
}
