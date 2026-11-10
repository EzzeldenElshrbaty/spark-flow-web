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

/** A span or div with an aria-label and no role; an arrow (`=>`) inside the tag isn't its end (UX Phase 6). */
const unreadLabels = (source: string) =>
  [...source.matchAll(/<(span|div)\b(?:=>|[^>])*?\saria-label=(?:=>|[^>])*>/g)].filter((m) => !/\srole=/.test(m[0])).map((m) => m[0])

describe('labels only where they’re read (5.12)', () => {
  it('no aria-label on a span or div without a role: screen readers ignore it there', () => {
    const found = files.flatMap(({ file, source }) => unreadLabels(source).map((tag) => `${file}: ${tag.slice(0, 60)}`))
    expect(found).toEqual([])
  })

  it('the scan sees past an arrow function before the label (UX Phase 6)', () => {
    expect(unreadLabels('<span onClick={() => x} aria-label="y">')).toHaveLength(1)
    expect(unreadLabels('<span role="img" onClick={() => x} aria-label="y">')).toHaveLength(0)
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

describe('readable text (5.8)', () => {
  // The faintest grey is for decoration only; what people read is fg-muted or darker. Allowed, with why:
  const decoration: Record<string, RegExp> = {
    'pages/help/HelpPage.tsx': /<BookOpen className="mx-auto size-8 text-fg-subtle"/, // the empty state's large icon
    'components/ui/DateTimePicker.tsx': /text-fg-subtle\/50 line-through/, // a day you can't pick (disabled)
  }
  it('no text-fg-subtle or placeholder:text-fg-subtle on text people read', () => {
    const found = files.flatMap(({ file, source }) =>
      source
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => /text-fg-subtle/.test(line) && !(decoration[file]?.test(line) && line.replace(decoration[file]!, '').search(/text-fg-subtle/) < 0))
        .map(({ i }) => `${file}:${i + 1}`),
    )
    expect(found).toEqual([])
  })
})

describe('small controls reach a 44px touch on phones (5.4)', () => {
  // Each pair: a file and a piece of its markup that must carry the touch area.
  const targets: [string, RegExp][] = [
    ['layout/TopBar.tsx', /label="Open menu"[^>]*max-md:touch-target|max-md:touch-target[^>]*label="Open menu"/],
    ['layout/TimerBar.tsx', /const button = clsx\(\s*'[^']*max-md:touch-target/],
    ['pages/chat/ChannelHeader.tsx', /IconStarFilled : IconStar}[\s\S]{0,200}max-md:touch-target/],
    ['pages/chat/ChannelTabs.tsx', /label="Add a bookmark".*max-md:size-11/],
    ['pages/chat/MessageList.tsx', /className={`sf-focus \$\{pillClass\} pe-2 max-md:touch-target`}/],
    ['pages/projects/HistoryList.tsx', /className="font-medium text-accent hover:underline max-md:touch-target"/],
    ['pages/projects/FilesTab.tsx', /className="min-w-0 text-accent hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center"/],
  ]
  it.each(targets)('%s', (file, pattern) => {
    expect(files.find((f) => f.file === file)?.source ?? '', file).toMatch(pattern)
  })
})

describe('focused fields show in dark (final review)', () => {
  it('a brand focus border has its dark brand-400 variant on the same line', () => {
    const missing = files.flatMap(({ file, source }) =>
      source
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => /focus:border-brand-500/.test(line) && !/dark:focus:border-brand-400/.test(line))
        .map(({ i }) => `${file}:${i + 1}`),
    )
    expect(missing).toEqual([])
  })
})
