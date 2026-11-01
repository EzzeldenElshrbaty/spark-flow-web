import { matchPath } from 'react-router'
import type { HelpChapter } from '@/lib/helpMarkdown'

// Which help explains each page (Admin and help, slice 6), for the round "?" in the top bar. A page gets a chapter,
// or only some of its sections when the chapter covers more than the page. `lib/pageHelp.test.ts` fails when a page in
// the router is neither here nor in NO_HELP.

/** `needs` repeats the chapter's own (a test keeps them equal), so the "?" can show without loading the chapters. */
export type PageHelp = { path: string; chapter: string; sections?: string[]; needs?: NonNullable<HelpChapter['needs']> }

export const PAGE_HELP: PageHelp[] = [
  { path: '', chapter: 'home' },
  { path: 'c/:channelId', chapter: 'chat' },
  { path: 'activity', chapter: 'threads-activity', sections: ['Activity'] },
  { path: 'threads', chapter: 'threads-activity', sections: ['Threads'] },
  { path: 'search', chapter: 'search' },
  { path: 'preferences', chapter: 'preferences' },
  { path: 'saved', chapter: 'saved-drafts', sections: ['Saved'] },
  { path: 'drafts', chapter: 'saved-drafts', sections: ['Drafts & sent'] },
  { path: 'projects', chapter: 'projects' },
  { path: 'tasks', chapter: 'tasks', sections: ['My tasks'] },
  { path: 'dashboard', chapter: 'dashboard', needs: 'dashboard.view' },
  { path: 'time', chapter: 'time-cost', needs: 'timeCost.view' },
  { path: 'teams', chapter: 'teams' },
  { path: 'p/:projectKey/overview', chapter: 'project-page', sections: ['Overview'] },
  { path: 'p/:projectKey/tasks', chapter: 'tasks' },
  { path: 'p/:projectKey/chat', chapter: 'project-page', sections: ['Chat'] },
  { path: 'p/:projectKey/time', chapter: 'time' },
  { path: 'p/:projectKey/history', chapter: 'project-page', sections: ['History'] },
  { path: 'settings', chapter: 'settings', needs: 'settings.open' },
  { path: 'settings/users', chapter: 'users', needs: 'settings.manage' },
  { path: 'settings/roles', chapter: 'roles', needs: 'settings.manage' },
  { path: 'settings/audit', chapter: 'audit-log', needs: 'audit.view' },
  { path: 'settings/attendance', chapter: 'attendance' },
  { path: 'settings/archived', chapter: 'archived', needs: 'archive.manage' },
  { path: 'settings/rates', chapter: 'rates', needs: 'rates.view' },
  { path: 'settings/database', chapter: 'database', needs: 'database.manage' },
]

/** Pages with no help of their own, and why. */
export const NO_HELP: Record<string, string> = {
  'p/:projectKey': 'Opens the project’s Overview tab, which has its own.',
  help: 'The help centre is the help.',
  'help/:chapter': 'The help centre is the help.',
}

/** The help for an address, or null when the page has none. */
export function pageHelpFor(pathname: string): PageHelp | null {
  return PAGE_HELP.find((rule) => matchPath(`/w/:ws${rule.path ? `/${rule.path}` : ''}`, pathname)) ?? null
}
