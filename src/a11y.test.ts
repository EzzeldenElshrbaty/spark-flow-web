import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Scans of the source for accessibility rules (UX Phase 5A).

const SRC = join(process.cwd(), 'src')

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return pages(path)
    return name.endsWith('.tsx') && !name.includes('.test.') && !name.includes('.testkit.') ? [path] : []
  })
}

const files = pages(SRC).map((path) => ({ file: relative(SRC, path), source: readFileSync(path, 'utf8') }))

describe('every page names its browser tab (5.7)', () => {
  // RecordHeader draws a project's h1; its page, ProjectPage, names the tab with the open tab too.
  const named = new Set(['components/ui/RecordHeader.tsx'])
  it('a file that draws an h1 calls useDocumentTitle', () => {
    const unnamed = files.filter(({ file, source }) => /<h1[\s>]/.test(source) && !source.includes('useDocumentTitle(') && !named.has(file)).map(({ file }) => file)
    expect(unnamed).toEqual([])
  })
})

describe('the shell starts with Skip to content (5.7)', () => {
  it('AppLayout renders the skip link before the sidebar, and its main has the id the link goes to', () => {
    const layout = files.find(({ file }) => file === 'layout/AppLayout.tsx')!.source
    expect(layout.indexOf('<SkipLink />')).toBeGreaterThan(-1)
    expect(layout.indexOf('<SkipLink />')).toBeLessThan(layout.indexOf('<Sidebar '))
    expect(layout).toContain('id="main"')
  })
})

describe('labels only where they’re read (5.12)', () => {
  it('no aria-label on a span or div without a role: screen readers ignore it there', () => {
    const tag = /<(span|div)\b[^>]*?\saria-label=[^>]*>/g
    const found = files.flatMap(({ file, source }) => [...source.matchAll(tag)].filter((m) => !/\srole=/.test(m[0])).map((m) => `${file}: ${m[0].slice(0, 60)}`))
    expect(found).toEqual([])
  })
})

describe('reduced motion (5.13)', () => {
  it('skeletons stop pulsing for people who ask for less motion, everywhere, not only in chat', () => {
    const css = readFileSync(join(SRC, 'index.css'), 'utf8')
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced.slice(0, reduced.indexOf('}\n}') + 3)).toMatch(/\.animate-pulse[^{]*\{[^}]*animation:\s*none/)
  })
})

describe('focus rings show in dark (5.8)', () => {
  it('a brand focus ring or outline has its dark brand-400 variant on the same line', () => {
    const focus = /(?:focus-visible|focus):(?:ring|outline)-brand-500/
    const missing = files.flatMap(({ file, source }) =>
      source
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => focus.test(line) && !/dark:(?:focus-visible|focus):(?:ring|outline)-brand-400/.test(line))
        .map(({ i }) => `${file}:${i + 1}`),
    )
    expect(missing).toEqual([])
  })
})

