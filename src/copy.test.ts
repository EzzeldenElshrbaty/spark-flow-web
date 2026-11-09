import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// UX Phase 3 (3.7), kit rule (design/05-ux-rules.md): copy uses curly apostrophes (’), never a straight one. Only what a
// person reads is scanned: string literals, template text and JSX text in the app and the mock's messages, and the
// prose of help chapters. Code, imports, comments, tests and the seed's demo content are left alone.

const SRC = join(process.cwd(), 'src')

function files(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path, keep)
    return keep(name) ? [path] : []
  })
}

const STRAIGHT = /[A-Za-z]'[A-Za-z]/
// A template part that starts right after `${…}`: "`${name}'s`".
const AFTER_EXPRESSION = /^'[a-z]/

/** "file:line: text" for each straight apostrophe in what a person reads in a .ts/.tsx file. */
export function straightInSource(path: string, source: string): string[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found: string[] = []
  const report = (node: ts.Node, text: string) => {
    const { line } = file.getLineAndCharacterOfPosition(node.getStart(file))
    found.push(`${relative(SRC, path)}:${line + 1}: ${text.trim().slice(0, 80)}`)
  }
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node)) {
      if (STRAIGHT.test(node.text)) report(node, node.text)
    } else if (ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      if (STRAIGHT.test(node.text) || AFTER_EXPRESSION.test(node.text)) report(node, node.text)
    } else if (ts.isJsxText(node)) {
      if (STRAIGHT.test(node.text)) report(node, node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}

/** "file:line: text" for each straight apostrophe in a help chapter's prose (code left out). */
export function straightInHelp(path: string, source: string): string[] {
  let code = false
  return source.split('\n').flatMap((line, i) => {
    if (line.trimStart().startsWith('```')) {
      code = !code
      return []
    }
    const prose = code ? '' : line.replace(/`[^`]*`/g, '')
    return STRAIGHT.test(prose) ? [`${relative(SRC, path)}:${i + 1}: ${line.trim().slice(0, 80)}`] : []
  })
}

describe('curly apostrophes (UX Phase 3, 3.7)', () => {
  it('the app’s copy and the mock’s messages use ’', () => {
    const sources = files(SRC, (name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.testkit.ts') && !name.endsWith('.d.ts'))
      .filter((path) => !/[/\\]mocks[/\\]seed[^/\\]*\.ts$/.test(path))
    expect(sources.flatMap((path) => straightInSource(path, readFileSync(path, 'utf8')))).toEqual([])
  })

  it('help chapters use ’', () => {
    const chapters = files(join(SRC, 'help'), (name) => name.endsWith('.md'))
    expect(chapters.flatMap((path) => straightInHelp(path, readFileSync(path, 'utf8')))).toEqual([])
  })

  it('finds them in strings, templates and JSX, never in code or comments', () => {
    const sample = [
      "import x from './it's'", // an import path, not copy
      '// it\'s a comment',
      "const a = \"It's here\"",
      'const b = `${name}\'s file`',
      'const c = <p>Don\'t go</p>',
      "const d = x['key']",
    ].join('\n')
    expect(straightInSource(join(SRC, 'sample.tsx'), sample).map((line) => line.split(': ')[1])).toEqual(["It's here", "'s file", "Don't go"])
  })
})
