import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(process.cwd(), 'src')

// Physical direction utilities (ml-, pr-, left-, text-left, border-l, rounded-r-, ...),
// including variant prefixes (lg:, hover:) and negatives (-ml-2). The UI must use the
// logical equivalents (ms-, pe-, start-, text-start, border-s, rounded-e-, ...).
const banned =
  /(?<![\w-])(?:[\w-]+:)*-?(?:ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|scroll-ml|scroll-mr)-[\w.[\]/]+|(?<![\w-])(?:[\w-]+:)*(?:text-left|text-right|border-l|border-r)(?![\w-])/g

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [path] : []
  })
}

// Only quoted string / template literal segments can hold class names, so prose
// in comments is never scanned. Line numbers are preserved by blanking everything else.
function stringLiteralsOnly(source: string): string {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, (_m, lead: string) => lead)
  return withoutComments.replace(
    /('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\[\s\S])*`)|[^\n]/g,
    (m, literal?: string) => (literal ? literal : m === '\n' ? '\n' : ' '),
  )
}

describe('RTL readiness', () => {
  it('uses logical direction classes only', () => {
    const hits: string[] = []
    for (const file of sourceFiles(SRC)) {
      const lines = stringLiteralsOnly(readFileSync(file, 'utf8')).split('\n')
      lines.forEach((line, i) => {
        for (const match of line.matchAll(banned)) {
          hits.push(`${relative(SRC, file)}:${i + 1}: ${match[0]}`)
        }
      })
    }
    expect(hits).toEqual([])
  })
})
