// Pages and actions for the top-bar search, so typing "lead" offers the Leads page first and then the things people
// do with leads (New lead, Assign leads, Overdue leads…), above the matching records. Each role only gets the pages
// its menu shows and the actions it may take. An action opens its form where it can (?new=1) or the page, tab or
// filter where it's done.
import { BookOpen, ChartColumn, type LucideIcon } from 'lucide-react'
import { reportList } from '../api/reports'
import type { Role } from '../lib/roles'
import { allNavItems, canSee, settingsItem } from '../navigation'

export type Shortcut = { id: string; title: string; subtitle: string; link: string; icon?: LucideIcon; keywords: string[] }

type ActionDef = { title: string; link: string; keywords?: string[]; roles?: Role[] }

const managers: Role[] = ['Management', 'Sales Manager']
const management: Role[] = ['Management']

/** Actions by the page they're done on; each also needs that page in the role's menu. */
const actionsByPage: Record<string, ActionDef[]> = {
  '/leads': [
    { title: 'New lead', link: '/leads?new=1', keywords: ['add', 'create', 'enquiry'] },
    { title: 'Assign leads', link: '/leads?tab=unassigned', keywords: ['unassigned', 'queue', 'salesperson'], roles: managers },
    { title: 'Leads waiting for a salesperson', link: '/leads?flag=waiting', keywords: ['unassigned'], roles: managers },
    { title: 'Overdue leads', link: '/leads?flag=overdue', keywords: ['late', 'next step'] },
    { title: 'Leads due today', link: '/leads?flag=today', keywords: ['next step'] },
    { title: 'Leads with no next step', link: '/leads?flag=nonext' },
    { title: 'Leads past their response time', link: '/leads?flag=sla', keywords: ['sla', 'breach'] },
    { title: 'Not now leads', link: '/leads?tab=later', keywords: ['later'] },
    { title: 'Disqualified leads', link: '/leads?tab=disqualified', keywords: ['reopen', 'not interested'] },
  ],
  '/opportunities': [
    { title: 'Opportunities list', link: '/opportunities?view=list', keywords: ['deals', 'table'] },
    { title: 'Overdue opportunities', link: '/opportunities?view=list&flag=overdue', keywords: ['deals', 'late', 'next step'] },
    { title: 'Opportunities due today', link: '/opportunities?view=list&flag=today', keywords: ['deals', 'next step'] },
    { title: 'Opportunities with no next step', link: '/opportunities?view=list&flag=nonext', keywords: ['deals'] },
    { title: 'Opportunities that need an owner', link: '/opportunities?view=list&flag=noowner', keywords: ['deals', 'assign'], roles: managers },
    { title: 'Opportunities on hold', link: '/opportunities?view=list&tab=hold', keywords: ['deals'] },
    { title: 'Won deals', link: '/opportunities?view=list&tab=won', keywords: ['opportunities', 'closed'] },
    { title: 'Lost deals', link: '/opportunities?view=list&tab=lost', keywords: ['opportunities'] },
  ],
  '/activities': [{ title: 'This week’s next steps', link: '/activities?view=week', keywords: ['calendar', 'week', 'activities'] }],
  '/approvals': [
    { title: 'Proposals to approve', link: '/approvals?tab=proposals', keywords: ['discount', 'approvals'] },
    { title: 'Won requests', link: '/approvals?tab=won', keywords: ['approvals', 'confirm', 'deals'], roles: management },
    { title: 'Exchange-rate requests', link: '/approvals?tab=rates', keywords: ['approvals', 'currency'], roles: management },
    { title: 'Approval history', link: '/approvals?tab=history', keywords: ['approvals'] },
  ],
  '/clients': [
    { title: 'New client', link: '/clients?new=1', keywords: ['add', 'create', 'company'], roles: managers },
    { title: 'Contacts', link: '/clients?view=contacts', keywords: ['people', 'clients'] },
    { title: 'Prospects', link: '/clients?tab=prospect', keywords: ['clients'] },
    { title: 'Past clients', link: '/clients?tab=past', keywords: ['former'] },
  ],
  '/projects': [{ title: 'Finished projects', link: '/projects?tab=finished', keywords: ['done', 'completed'] }],
  '/payments': [
    { title: 'Overdue payments', link: '/payments?tab=overdue', keywords: ['late', 'collections'] },
    { title: 'Payments due in 30 days', link: '/payments?tab=soon', keywords: ['collections', 'upcoming'] },
    { title: 'Collected payments', link: '/payments?view=collected', keywords: ['received', 'paid', 'collections'] },
  ],
  '/recurring-services': [
    { title: 'Add recurring service', link: '/recurring-services?new=1', keywords: ['new', 'create'], roles: management },
    { title: 'Upcoming renewals', link: '/recurring-services?tab=renewals', keywords: ['recurring', 'services', 'renew'] },
    { title: 'Cancelled services', link: '/recurring-services?tab=cancelled', keywords: ['recurring'] },
  ],
  '/targets': [{ title: 'Company targets', link: '/targets?view=company', keywords: ['year'], roles: management }],
  '/settings': [
    { title: 'New user', link: '/settings/users?new=1', keywords: ['add', 'create', 'users', 'people'] },
    { title: 'Add market', link: '/settings/markets?new=1', keywords: ['new', 'create', 'markets', 'country'] },
    { title: 'Add currency', link: '/settings/currencies?new=1', keywords: ['new', 'create', 'currencies'] },
  ],
}

const reportsPath = '/reports'

/** Every page and action this role can use, in menu order. */
export function shortcutsFor(role: Role): { pages: Shortcut[]; actions: Shortcut[] } {
  const pages: Shortcut[] = []
  const actions: Shortcut[] = []
  for (const item of allNavItems) {
    if (!canSee(item, role)) continue
    pages.push({ id: item.path, title: item.label, subtitle: item.description ?? '', link: item.path, icon: item.icon, keywords: [] })
    for (const action of actionsByPage[item.path] ?? []) {
      if (action.roles && !action.roles.includes(role)) continue
      actions.push({ id: action.link, title: action.title, subtitle: item.label, link: action.link, icon: item.icon, keywords: [item.label, ...(action.keywords ?? [])] })
    }
    if (item.path === reportsPath) {
      for (const report of reportList) {
        pages.push({ id: `${reportsPath}/${report.id}`, title: report.title, subtitle: `Report · ${report.description}`, link: `${reportsPath}/${report.id}`, icon: ChartColumn, keywords: ['report', report.section] })
      }
    }
    if (item === settingsItem) {
      for (const section of item.children ?? []) {
        const path = `${item.path}/${section.path}`
        pages.push({ id: path, title: section.label, subtitle: 'Settings', link: path, icon: item.icon, keywords: ['settings'] })
      }
    }
  }
  pages.push({ id: '/help', title: 'Help guide', subtitle: `How Spark CRM works for the ${role} role.`, link: '/help', icon: BookOpen, keywords: ['guide', 'how to', 'manual'] })
  return { pages, actions }
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
  return { pages: best(all.pages, term, typed, 4, true), actions: best(all.actions, term, typed, 10, false) }
}
