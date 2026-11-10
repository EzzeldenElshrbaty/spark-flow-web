import '@/index.css'
import { describe, expect, inject, it } from 'vitest'
import { renderApp } from '@/test/app'
import { pageProblems } from '@/test/uxChecks'
import { sortKnown, uxCases } from '@/test/uxMatrix'

// UX Phase 6, 6.1: the audit's checks on every page, as every role, in both themes and on the four screens. `npm test`
// runs a pairwise set; `npm run test:ux` runs all of it. A problem waiting on a decision goes in src/test/uxKnown.ts.

describe('UX checks', () => {
  for (const c of uxCases(inject('uxMatrix'))) {
    it(c.id, async () => {
      const app = await renderApp({ path: c.path, as: c.as, theme: c.theme, size: c.size })
      await app.settled()
      expect(sortKnown(c, await pageProblems(app))).toEqual({ left: [], stale: [] })
    }, 20_000)
  }
})
