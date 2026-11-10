import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrast, tokens } from '@/test/contrast'

// UX Phase 5B (5.8): the kit's tokens stay Spark CRM's, and the pairs Flow uses pass contrast in both themes.
const root = new URL('../../', import.meta.url)
const css = readFileSync(new URL('src/index.css', root), 'utf8')
const kit = readFileSync(new URL('design/reference-code/src/index.css', root), 'utf8')

const light = tokens(css, ':root')
const dark = { ...light, ...tokens(css, '.dark') }
const brand = tokens(css, '@theme')
const themes = { light, dark }

describe('kit tokens (UX Phase 5B, 5.8)', () => {
  it('keeps every value it shares with the Spark CRM kit', () => {
    for (const selector of [':root', '.dark', '@theme']) {
      const ours = tokens(css, selector)
      const theirs = tokens(kit, selector)
      for (const [name, value] of Object.entries(theirs)) if (name in ours) expect(ours[name], `${selector} --${name}`).toBe(value)
    }
  })

  it('text Flow reads passes 4.5:1 on the surfaces it sits on, in both themes', () => {
    for (const [theme, t] of Object.entries(themes)) {
      for (const text of ['fg', 'fg-secondary', 'fg-tertiary', 'fg-muted'])
        for (const bg of ['surface', 'surface-sunken', 'canvas']) expect(contrast(t[text]!, t[bg]!), `${theme} ${text} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(t['fg-tertiary']!, t['surface-muted']!), `${theme} fg-tertiary on surface-muted`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('field borders reach 3:1 on the surfaces fields sit on, in both themes', () => {
    for (const [theme, t] of Object.entries(themes))
      for (const bg of ['surface', 'surface-sunken', 'surface-muted']) expect(contrast(t['line-input']!, t[bg]!), `${theme} line-input on ${bg}`).toBeGreaterThanOrEqual(3)
  })

  it('focus rings reach 3:1: brand-500 on light surfaces, brand-400 on dark ones', () => {
    expect(contrast(brand['color-brand-500']!, light.surface!)).toBeGreaterThanOrEqual(3)
    expect(contrast(brand['color-brand-400']!, dark.surface!)).toBeGreaterThanOrEqual(3)
  })
})
