// Pages and actions for the top-bar search, so typing a page's name offers that page first and then the things people
// do there. Each role only gets the pages its menu shows and the actions it may take. An action opens its form where
// it can (?new=1) or the page, tab or filter where it's done.
import { IconHash, IconLayoutKanban, IconListCheck, IconLock, IconMessage, IconUser, type TablerIcon } from '@tabler/icons-react'
import type { Channel, Project, TaskView, User, Workspace } from '@/api/types'
import { channelLabel, isArchived } from '@/lib/channels'
import { paths } from '@/lib/paths'
import type { Permission } from '@/lib/permissions'
import type { WorkspaceMode } from '@/lib/workspaceMode'
import { allNavItems, canSee, settingsItem } from '@/navigation'

export type Shortcut = { id: string; title: string; subtitle: string; link: string; icon?: TablerIcon; keywords: string[] }

type ActionDef = { title: string; link: string; keywords?: string[]; permission?: Permission }

/** Actions by the page they're done on; each also needs that page in the role's menu. Add them as pages are built. */
const actionsByPage: Record<string, ActionDef[]> = {}

/** Pages live inside a workspace, so they have a link only when one is open. */
const pathOf = (item: (typeof allNavItems)[number], workspaceSlug: string | null) => (item.link ? (workspaceSlug ? item.link(workspaceSlug) : null) : item.path)

/** Every page and action these permissions allow, in menu order. */
export function shortcutsFor(grants: readonly Permission[], workspaceSlug: string | null): { pages: Shortcut[]; actions: Shortcut[] } {
  const pages: Shortcut[] = []
  const actions: Shortcut[] = []
  for (const item of allNavItems) {
    const path = pathOf(item, workspaceSlug)
    if (!canSee(item, grants) || path === null) continue
    pages.push({ id: path, title: item.label, subtitle: item.description ?? '', link: path, icon: item.icon, keywords: [] })
    for (const action of actionsByPage[item.path] ?? []) {
      if (action.permission && !grants.includes(action.permission)) continue
      actions.push({ id: action.link, title: action.title, subtitle: item.label, link: action.link, icon: item.icon, keywords: [item.label, ...(action.keywords ?? [])] })
    }
    if (item === settingsItem) {
      for (const section of item.children ?? []) {
        const sectionPath = pathOf(section, workspaceSlug)
        if (!canSee(section, grants) || sectionPath === null) continue
        pages.push({ id: sectionPath, title: section.label, subtitle: 'Settings', link: sectionPath, icon: item.icon, keywords: ['settings'] })
      }
    }
  }
  return { pages, actions }
}

/** The channels, DMs and project boards of one workspace, so search finds them like pages. */
export function workspaceShortcuts(ws: Workspace, channels: Channel[], projects: Project[], users: User[], meId: string): Shortcut[] {
  return [
    // Archived channels are left out; every other public channel is found here (the sidebar lists only mine).
    ...channels.filter((c) => !isArchived(c)).map((channel): Shortcut => {
      const dm = channel.kind === 'dm'
      const label = channelLabel(channel, users, meId)
      return {
        id: `channel:${channel.id}`,
        title: dm ? label : `#${label}`,
        subtitle: dm ? 'Direct message' : channel.isPrivate ? 'Private channel' : 'Channel',
        link: paths.channel(ws.slug, channel.id),
        icon: dm ? IconMessage : channel.isPrivate ? IconLock : IconHash,
        keywords: dm ? ['dm', 'direct message'] : ['channel'],
      }
    }),
    ...projects.map((project): Shortcut => ({
      id: `project:${project.key}`,
      title: `${project.name} · Board`,
      subtitle: `Project ${project.key}`,
      link: paths.project(ws.slug, project.key, 'tasks', { view: 'board' }),
      icon: IconLayoutKanban,
      keywords: [project.key, 'project', 'board'],
    })),
  ]
}

const keys = new Intl.Collator('en', { numeric: true })

/**
 * Tasks for the search box: a key that starts with what was typed (NEX-1 → NEX-1, NEX-10…), in key order, then
 * titles containing it. At most 5; a picked task opens beside its project's Tasks tab.
 */
export function taskShortcuts(workspaceSlug: string, tasks: TaskView[], projects: Pick<Project, 'id' | 'key'>[], raw: string): Shortcut[] {
  const q = raw.trim().toLowerCase()
  if (!q) return []
  const byKey = tasks.filter((t) => t.key.toLowerCase().startsWith(q)).sort((a, b) => keys.compare(a.key, b.key))
  const byTitle = tasks.filter((t) => !byKey.includes(t) && t.title.toLowerCase().includes(q)).sort((a, b) => keys.compare(a.key, b.key))
  return [...byKey, ...byTitle].slice(0, 5).flatMap((t) => {
    const project = projects.find((p) => p.id === t.projectId)
    if (!project) return []
    return [{ id: `task:${t.key}`, title: `${t.key} · ${t.title}`, subtitle: 'Task', link: `${paths.project(workspaceSlug, project.key, 'tasks')}?ticket=${encodeURIComponent(t.key)}`, icon: IconListCheck, keywords: [] }]
  })
}

/** People for the search box, by name or title, never me; picking one opens your conversation with them (`dm:<id>`). */
export function peopleShortcuts(users: User[], meId: string, raw: string): (Shortcut & { userId: string })[] {
  const q = raw.trim().toLowerCase()
  if (!q) return []
  return users
    .filter((u) => u.id !== meId && (u.name.toLowerCase().includes(q) || u.title.toLowerCase().includes(q)))
    .slice(0, 5)
    .map((u) => ({ id: `person:${u.id}`, userId: u.id, title: u.name, subtitle: u.title, link: `dm:${u.id}`, icon: IconUser, keywords: [] }))
}

/** "opportunities" → "opportunity", "leads" → "lead", so singular and plural find each other. */
const stem = (word: string) => (word.length > 4 && word.endsWith('ies') ? `${word.slice(0, -3)}y` : word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word)
const wordsOf = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

/** Every typed word starts a word of the text (ignoring plurals). */
function matches(text: string, typed: string[]) {
  const words = wordsOf(text).map(stem)
  return typed.every((word) => words.some((candidate) => candidate.startsWith(word)))
}

/**
 * How well a shortcut matches: its title first, then its keywords and page; 0 when it doesn't. Pages whose name starts
 * with the words come next after an exact name; actions keep their page's order (New lead before the filters).
 */
function score(shortcut: Shortcut, term: string, typed: string[], byStart: boolean) {
  const title = shortcut.title.toLowerCase()
  if (title === term || stem(title) === stem(term)) return 5
  if (byStart && title.startsWith(term)) return 4
  if (matches(shortcut.title, typed)) return 3
  if (matches(`${shortcut.title} ${shortcut.keywords.join(' ')}`, typed)) return 2
  return 0
}

function best(list: Shortcut[], term: string, typed: string[], limit: number, byStart: boolean) {
  return list
    .map((shortcut, index) => ({ shortcut, index, score: score(shortcut, term, typed, byStart) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.shortcut)
}

/** The pages and actions matching what was typed, best first. */
export function findShortcuts(all: { pages: Shortcut[]; actions: Shortcut[] }, raw: string) {
  const term = raw.trim().toLowerCase()
  const typed = wordsOf(term).map(stem)
  if (!typed.length) return { pages: [], actions: [] }
  return { pages: best(all.pages, term, typed, 8, true), actions: best(all.actions, term, typed, 10, false) }
}

/**
 * Whether a key opens the top-bar search (spec 10): ⌘/Ctrl+K anywhere, or / when not typing. Not a key a control has
 * already taken: in the composer ⌘K is Link (spec 6.8). With single-key shortcuts off (Preferences, UX Phase 5A, 5.13)
 * / types, and ⌘/Ctrl+K still opens.
 */
export function opensSearch(event: KeyboardEvent, singleKeys = true): boolean {
  if (event.defaultPrevented) return false
  const target = event.target as HTMLElement | null
  const typing = Boolean(target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)))
  return (event.key === 'k' && (event.metaKey || event.ctrlKey)) || (singleKeys && event.key === '/' && !typing)
}

/** The search box's hint on each side of Flow (spec 5.5). Both sides search everything; the hint leads with theirs. */
export function searchPlaceholder(mode: WorkspaceMode): string {
  return mode === 'projects' ? 'Search projects, tasks, people…' : 'Search channels, people, tasks…'
}
