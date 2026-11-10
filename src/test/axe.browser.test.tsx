import { afterEach, describe, expect, it } from 'vitest'
import { axeProblems } from './axe'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('axeProblems checks contrast (UX Phase 5B, 5.8)', () => {
  it('reports low-contrast text', async () => {
    document.body.innerHTML = '<main><p style="color:#cccccc;background:#ffffff">Low contrast words</p></main>'
    expect((await axeProblems(document)).some((p) => p.startsWith('color-contrast'))).toBe(true)
  })
})
