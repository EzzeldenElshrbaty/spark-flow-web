import { ROLE_USER, SIZE, type Role, type Size, type Theme } from './setups'
import { UX_KNOWN, type KnownProblem } from './uxKnown'

/**
 * The page loads the UX checks run (UX Phase 6, 6.1): every page × role × theme × size (`full`, `npm run test:ux`), or a
 * pairwise set for `npm test` — every page as every role once, each page in both themes and all four sizes.
 */

declare module 'vitest' {
  export interface ProvidedContext {
    uxMatrix: 'pairwise' | 'full'
  }
}

export type UxCase = { id: string; path: string; as: Role | null; theme: Theme; size: Size }

const WS = '/w/engineering/'

/** The pages, as the audit crawled them (section 9B), under the engineering workspace unless they start with '/'. */
export const UX_PAGES: string[] = [
  'dashboard',
  '',
  'projects',
  'teams',
  'time',
  'p/NEX/overview',
  'p/NEX/tasks',
  'p/NEX/tasks?ticket=NEX-101',
  'p/NEX/chat',
  'p/NEX/time',
  'p/NEX/history',
  'p/NEX/files',
  'c/c-general',
  'activity',
  'threads',
  'search?q=login',
  'preferences',
  'saved',
  'drafts',
  'settings',
  'settings/users',
  'settings/roles',
  'settings/audit',
  'settings/archived',
  'settings/attendance',
  'settings/rates',
  'settings/database',
  'help',
  'help/tasks',
  '/nowhere',
]

export const ROLES: Role[] = ['admin', 'pm', 'member', 'sales']
export const THEMES: Theme[] = ['light', 'dark']
export const SIZES: Size[] = ['desktop', 'laptop', 'tablet', 'phone']

const SIGN_IN = '/signin'

function at(path: string, as: Role | null, theme: Theme, size: Size): UxCase {
  const who = as ? ROLE_USER[as].label : 'Signed out'
  return { id: `${who} · ${theme} · ${SIZE[size][0]} · ${path}`, path, as, theme, size }
}

const full = (page: string) => (page.startsWith('/') ? page : WS + page)

export function uxCases(mode: 'pairwise' | 'full'): UxCase[] {
  if (mode === 'full')
    return [
      ...UX_PAGES.flatMap((page) => ROLES.flatMap((role) => THEMES.flatMap((theme) => SIZES.map((size) => at(full(page), role, theme, size))))),
      ...THEMES.flatMap((theme) => SIZES.map((size) => at(SIGN_IN, null, theme, size))),
    ]
  return [
    // Page p as role r: sizes walk round with p + r, and the theme turns over halfway through the roles, so each page
    // gets all four sizes and both themes, and each size meets both themes.
    ...UX_PAGES.flatMap((page, p) =>
      ROLES.map((role, r) => {
        const s = (p + r) % SIZES.length
        return at(full(page), role, THEMES[(s + Math.floor(r / 2)) % 2]!, SIZES[s]!)
      }),
    ),
    at(SIGN_IN, null, 'light', 'desktop'),
    at(SIGN_IN, null, 'dark', 'phone'),
  ]
}

const matches = (c: UxCase, entry: KnownProblem) => Object.entries(entry.match).every(([key, value]) => c[key as keyof UxCase] === value)

/** Sets aside the known problems of this case; `stale` names the entries for it whose problem no longer happens. */
export function sortKnown(c: UxCase, problems: string[], known: KnownProblem[] = UX_KNOWN): { left: string[]; stale: string[] } {
  const mine = known.filter((entry) => matches(c, entry))
  return {
    left: problems.filter((line) => !mine.some((entry) => line.startsWith(entry.problem))),
    stale: mine.filter((entry) => !problems.some((line) => line.startsWith(entry.problem))).map((entry) => `Known problem no longer happens — remove it from uxKnown.ts: ${entry.problem} (${entry.why})`),
  }
}
