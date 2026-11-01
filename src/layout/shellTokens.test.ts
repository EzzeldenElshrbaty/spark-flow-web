import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The shell around the chat (spec 3.1, 5.2, 5.4): the top bar's menus, its search, the phone bar and the nav list
// they read. These use the redesign's tokens (`sf-` utilities) and Tabler icons only, never lucide or the Spark CRM
// classes. The task inspector's frame stays in the projects module's style, so it isn't listed.
const SHELL = [
  'layout/UserMenu.tsx',
  'layout/WorkspaceSwitcher.tsx',
  'layout/NotificationsMenu.tsx',
  'layout/GlobalSearch.tsx',
  'layout/searchShortcuts.ts',
  'layout/MobileNav.tsx',
  'navigation.ts',
]

/** Spark CRM utilities that have an `sf-` counterpart (colours, surfaces, lines, radii and shadows). */
const LEGACY =
  /(?<![\w-])(?:[\w-]+:)*(?:text-fg(?:-\w+)?|bg-surface(?:-\w+)?|border-line(?:-\w+)?|divide-line(?:-\w+)?|text-accent(?:-\w+)?|bg-accent-soft\S*|bg-brand-\d+|text-brand-\d+|ring-brand-\d+|rounded-(?:md|lg|xl|2xl)|shadow-(?:sm|md|lg|xl|2xl)|text-red-\d+)(?![\w-])/g

describe('the shell uses the redesign only (spec 3.1)', () => {
  for (const file of SHELL) {
    it(`${file}: Tabler icons and sf- tokens`, () => {
      const source = readFileSync(join(process.cwd(), 'src', file), 'utf8')
      expect(source).not.toMatch(/from 'lucide-react'/)
      expect([...source.replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '').matchAll(LEGACY)].map((m) => m[0])).toEqual([])
    })
  }
})
