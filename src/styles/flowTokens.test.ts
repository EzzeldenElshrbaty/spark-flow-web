import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The Flow chat tokens must match the approved design files exactly, and the text pairs the spec
// names (section 3.2) must meet their contrast targets in both themes.
const root = new URL('../../', import.meta.url)
const css = readFileSync(new URL('src/styles/flow-tokens.css', root), 'utf8')
const spec = JSON.parse(readFileSync(new URL('docs/flow-chat/design/spark-flow-tokens.json', root), 'utf8')) as {
  color: { tokens: { name: string; value: string | { light: string; dark: string } }[] }
}

/** Custom properties declared in the first block whose selector list starts with `selector`. */
function block(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`)
  expect(start, selector).toBeGreaterThanOrEqual(0)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  const vars = new Map<string, string>()
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars.set(m[1], m[2].trim())
  return vars
}

const light = block('.sf')
const dark = new Map([...light, ...block("[data-theme='dark'] .sf")])

function resolve(vars: Map<string, string>, name: string): string {
  let value = vars.get(name)
  for (let i = 0; value?.startsWith('var(') && i < 10; i++) value = vars.get(value.slice(6, -1))
  if (value === undefined) throw new Error(`--${name} is not defined`)
  return value.toLowerCase()
}

function hex(value: string): string {
  const v = value.toLowerCase()
  return v === '#fff' ? '#ffffff' : v
}

function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex(color).slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('flow tokens', () => {
  it('declares every colour token of the design file with its value, in both themes', () => {
    const raw = new Map(spec.color.tokens.flatMap((t) => (typeof t.value === 'string' ? [[t.name, t.value]] : [])))
    // The design file writes references as {ink-900}.
    const value = (v: string) => (v.startsWith('{') ? raw.get(v.slice(1, -1))! : v)
    let checked = 0
    for (const token of spec.color.tokens) {
      const [l, d] = typeof token.value === 'string' ? [token.value, token.value] : [token.value.light, token.value.dark]
      if (value(l).startsWith('rgba')) continue // overlays are compared as written below
      expect(hex(resolve(light, token.name)), `${token.name} light`).toBe(hex(value(l)))
      expect(hex(resolve(dark, token.name)), `${token.name} dark`).toBe(hex(value(d)))
      checked++
    }
    expect(checked).toBe(spec.color.tokens.length - 1)
  })

  it('keeps the overlay values of section 3.2', () => {
    expect(resolve(light, 'overlay')).toBe('rgba(10, 10, 11, 0.5)')
    expect(resolve(dark, 'overlay')).toBe('rgba(0, 0, 0, 0.64)')
  })

  const text: [string, string[]][] = [
    ['text', ['surface', 'surface-hover', 'surface-sunken', 'surface-selected', 'surface-mention']],
    ['text-secondary', ['surface', 'surface-hover', 'surface-sunken']],
    ['text-muted', ['surface', 'surface-hover', 'surface-sunken']],
    ['accent', ['surface', 'surface-hover', 'surface-mention']],
    // Error text sits near the cause, on the same surfaces (spec 3.2: "Same as Spark Red").
    ['error', ['surface', 'surface-hover', 'surface-sunken']],
    ['on-accent', ['accent-fill', 'accent-fill-hover']],
    ['sidebar-text', ['app-frame', 'sidebar-hover', 'sidebar-active']],
    ['sidebar-text-strong', ['app-frame', 'sidebar-hover', 'sidebar-active']],
    ['sidebar-text-muted', ['app-frame', 'sidebar-hover']],
  ]

  for (const [theme, vars] of [['light', light], ['dark', dark]] as const) {
    it(`meets 4.5:1 for text pairs in ${theme}`, () => {
      for (const [fg, bgs] of text)
        for (const bg of bgs)
          expect(contrast(resolve(vars, fg), resolve(vars, bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
    })

    it(`meets 3:1 for control borders, icons and the focus ring in ${theme}`, () => {
      expect(contrast(resolve(vars, 'line-strong'), resolve(vars, 'surface'))).toBeGreaterThanOrEqual(3)
      expect(contrast(resolve(vars, 'focus'), resolve(vars, 'surface'))).toBeGreaterThanOrEqual(3)
      expect(contrast(resolve(vars, 'sidebar-accent'), resolve(vars, 'sidebar-active'))).toBeGreaterThanOrEqual(3)
      expect(contrast(resolve(vars, 'presence-active'), resolve(vars, 'app-frame'))).toBeGreaterThanOrEqual(3)
    })
  }
})
