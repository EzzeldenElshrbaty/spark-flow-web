// Pages and actions for the top-bar search, so typing a page's name offers that page first and then the things people
// do there. Each role only gets the pages its menu shows and the actions it may take. An action opens its form where
// it can (?new=1) or the page, tab or filter where it's done.
import { FolderKanban, Hash, Lock, MessageSquare, type LucideIcon } from 'lucide-react'
import type { Channel, Project, User, Workspace } from '@/api/types'
import { channelLabel } from '@/lib/channels'
import { paths } from '@/lib/paths'
import type { Role } from '@/lib/roles'
import { allNavItems, canSee, settingsItem } from '@/navigation'

export type Shortcut = { id: string; title: string; subtitle: string; link: string; icon?: LucideIcon; keywords: string[] }

type ActionDef = { title: string; link: string; keywords?: string[]; roles?: Role[] }

/** Actions by the page they're done on; each also needs that page in the role's menu. Add them as pages are built. */
const actionsByPage: Record<string, ActionDef[]> = {}

/** Settings lives inside a workspace, so it has a link only when one is open; the other items keep their own path. */
const pathOf = (item: (typeof allNavItems)[number], workspaceSlug: string | null) =>
  item === settingsItem ? (workspaceSlug ? paths.settings(workspaceSlug) : null) : item.path

/** Every page and action this role can use, in menu order. */
export function shortcutsFor(role: Role, workspaceSlug: string | null): { pages: Shortcut[]; actions: Shortcut[] } {
  const pages: Shortcut[] = []
  const actions: Shortcut[] = []
  for (const item of allNavItems) {
    const path = pathOf(item, workspaceSlug)
    if (!canSee(item, role) || path === null) continue
    pages.push({ id: path, title: item.label, subtitle: item.description ?? '', link: path, icon: item.icon, keywords: [] })
    for (const action of actionsByPage[item.path] ?? []) {
      if (action.roles && !action.roles.includes(role)) continue
      actions.push({ id: action.link, title: action.title, subtitle: item.label, link: action.link, icon: item.icon, keywords: [item.label, ...(action.keywords ?? [])] })
    }
    if (item === settingsItem) {
      for (const section of item.children ?? []) {
        const sectionPath = `${path}/${section.path}`
        pages.push({ id: sectionPath, title: section.label, subtitle: 'Settings', link: sectionPath, icon: item.icon, keywords: ['settings'] })
      }
    }
  }
  return { pages, actions }
}

/** The channels, DMs and project boards of one workspace, so search finds them like pages. */
export function workspaceShortcuts(ws: Workspace, channels: Channel[], projects: Project[], users: User[], meId: string): Shortcut[] {
  return [
    ...channels.map((channel): Shortcut => {
      const dm = channel.kind === 'dm'
      const label = channelLabel(channel, users, meId)
      return {
        id: `channel:${channel.id}`,
        title: dm ? label : `#${label}`,
        subtitle: dm ? 'Direct message' : channel.isPrivate ? 'Private channel' : 'Channel',
        link: paths.channel(ws.slug, channel.id),
        icon: dm ? MessageSquare : channel.isPrivate ? Lock : Hash,
        keywords: dm ? ['dm', 'direct message'] : ['channel'],
      }
    }),
    ...projects.map((project): Shortcut => ({
      id: `project:${project.key}`,
      title: `${project.name} · Board`,
      subtitle: `Project ${project.key}`,
      link: paths.project(ws.slug, project.key, 'tasks', { view: 'board' }),
      icon: FolderKanban,
      keywords: [project.key, 'project', 'board'],
    })),
  ]
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
