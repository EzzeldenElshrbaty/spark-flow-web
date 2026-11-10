import { describe, expect, it } from 'vitest'
import { sortKnown, UX_PAGES, uxCases, type UxCase } from './uxMatrix'

// UX Phase 6, 6.1: which page loads the UX checks run, and how known problems are set aside.

const pairs = (cases: UxCase[], key: (c: UxCase) => string) => new Set(cases.map(key))

describe('uxCases', () => {
  it('the whole matrix is every page × role × theme × size, plus Sign in in every theme and size', () => {
    expect(UX_PAGES).toHaveLength(31)
    expect(uxCases('full')).toHaveLength(31 * 4 * 2 * 4 + 8)
  })

  it('the pairwise set is every page as every role once, plus Sign in twice', () => {
    const cases = uxCases('pairwise')
    expect(cases).toHaveLength(126)
    const signedIn = cases.filter((c) => c.as)
    expect(pairs(signedIn, (c) => `${c.path}|${c.as}`).size).toBe(124)
  })

  it('pairwise, each page gets both themes and all four sizes', () => {
    const cases = uxCases('pairwise').filter((c) => c.as)
    for (const path of new Set(cases.map((c) => c.path))) {
      const own = cases.filter((c) => c.path === path)
      expect(pairs(own, (c) => c.theme).size, path).toBe(2)
      expect(pairs(own, (c) => c.size).size, path).toBe(4)
    }
  })

  it('pairwise, each size meets both themes, and each role every size and both themes', () => {
    const cases = uxCases('pairwise').filter((c) => c.as)
    expect(pairs(cases, (c) => `${c.size}|${c.theme}`).size).toBe(8)
    for (const role of ['admin', 'pm', 'member', 'sales']) {
      const own = cases.filter((c) => c.as === role)
      expect(pairs(own, (c) => c.theme).size, role).toBe(2)
      expect(pairs(own, (c) => c.size).size, role).toBe(4)
    }
  })

  it('ids are unique and say who, theme, width and page', () => {
    const ids = uxCases('full').map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('Member · dark · 390 · /w/engineering/settings/users')
    expect(ids).toContain('Signed out · light · 1440 · /signin')
  })
})

describe('sortKnown', () => {
  const at: UxCase = { id: 'x', path: '/w/engineering/projects', as: 'admin', theme: 'light', size: 'desktop' }
  const known = [{ match: { path: '/w/engineering/projects', theme: 'light' as const }, problem: 'color-contrast: .chip', why: 'Needs a design call.' }]

  it('a matching entry sets its problem aside', () => {
    expect(sortKnown(at, ['color-contrast: .chip span', 'missing h1'], known)).toEqual({ left: ['missing h1'], stale: [] })
  })

  it('a matching entry whose problem is gone is stale', () => {
    expect(sortKnown(at, [], known).stale).toEqual(['Known problem no longer happens — remove it from uxKnown.ts: color-contrast: .chip (Needs a design call.)'])
  })

  it('an entry for another case does nothing', () => {
    expect(sortKnown({ ...at, theme: 'dark' }, ['color-contrast: .chip span'], known)).toEqual({ left: ['color-contrast: .chip span'], stale: [] })
  })
})
