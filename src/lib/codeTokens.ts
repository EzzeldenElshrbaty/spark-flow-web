import type { CodeLanguage } from '@/api/types'

/** The snippet Type list (spec 6.9): Plain text, then by name. */
export const CODE_LANGUAGES: { id: CodeLanguage; label: string }[] = [
  { id: 'text', label: 'Plain text' },
  { id: 'bash', label: 'Bash' },
  { id: 'csharp', label: 'C#' },
  { id: 'css', label: 'CSS' },
  { id: 'html', label: 'HTML' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'json', label: 'JSON' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'python', label: 'Python' },
  { id: 'sql', label: 'SQL' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'yaml', label: 'YAML' },
]

export const languageLabel = (id: CodeLanguage) => CODE_LANGUAGES.find((l) => l.id === id)?.label ?? 'Plain text'

/** A run of code and how it reads: the card gives keywords weight 600, strings `text-secondary`, comments `text-muted`. */
export type CodeToken = { text: string; kind: 'plain' | 'keyword' | 'string' | 'comment' | 'number' }

type Rules = {
  keywords?: Set<string>
  /** Keywords match in any case (SQL). */
  anyCase?: boolean
  line?: string[]
  block?: [string, string]
  quotes?: string[]
  /** YAML: the key before `:` reads as a keyword. */
  yamlKeys?: boolean
}

const words = (list: string) => new Set(list.split(' '))
const JS = 'async await break case catch class const continue default delete do else export extends false finally for from function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while yield'
const RULES: Record<CodeLanguage, Rules> = {
  text: {},
  markdown: {},
  javascript: { keywords: words(JS), line: ['//'], block: ['/*', '*/'], quotes: ['"', "'", '`'] },
  typescript: { keywords: words(`${JS} as enum implements interface keyof private protected public readonly type`), line: ['//'], block: ['/*', '*/'], quotes: ['"', "'", '`'] },
  csharp: {
    keywords: words('abstract async await bool break case catch class const continue decimal default do double else enum false finally for foreach if in int interface internal is long namespace new null object override private protected public readonly record return sealed static string struct switch this throw true try using var virtual void while'),
    line: ['//'],
    block: ['/*', '*/'],
    quotes: ['"', "'"],
  },
  python: { keywords: words('and as async await break class continue def elif else except False finally for from if import in is lambda None not or pass raise return True try while with yield'), line: ['#'], quotes: ['"', "'"] },
  bash: { keywords: words('case cd do done echo elif else esac exit export fi for function if in local return set then until while'), line: ['#'], quotes: ['"', "'"] },
  sql: {
    keywords: words('add alter and as asc by case create delete desc distinct drop else end exists from group having in index inner insert into is join left limit not null offset on or order outer right select set table then union update values when where with analyze explain'),
    anyCase: true,
    line: ['--'],
    block: ['/*', '*/'],
    quotes: ["'", '"'],
  },
  css: { line: [], block: ['/*', '*/'], quotes: ['"', "'"] },
  html: { block: ['<!--', '-->'], quotes: ['"', "'"] },
  json: { keywords: words('true false null'), quotes: ['"'] },
  yaml: { keywords: words('true false null'), line: ['#'], quotes: ['"', "'"], yamlKeys: true },
}

const WORD = /[A-Za-z_][\w$]*/y
const NUMBER = /\d+(?:\.\d+)?/y
const YAML_KEY = /^(\s*)([\w-]+)(?=\s*:)/

/**
 * Splits code into lines of tokens for the snippet card. Each line's tokens join back to the line exactly; a block
 * comment carries across lines, a string never does (an unclosed one ends with its line).
 */
export function tokenize(code: string, language: CodeLanguage): CodeToken[][] {
  const rules = RULES[language] ?? {}
  const lines = code.split(/\r?\n/)
  let inBlock = false
  return lines.map((line) => {
    const out: CodeToken[] = []
    const push = (text: string, kind: CodeToken['kind']) => {
      if (!text) return
      const last = out.at(-1)
      if (last && last.kind === kind) last.text += text
      else out.push({ text, kind })
    }
    let i = 0
    if (rules.yamlKeys) {
      const key = YAML_KEY.exec(line)
      if (key) {
        push(key[1], 'plain')
        push(key[2], 'keyword')
        i = key[0].length
      }
    }
    while (i < line.length) {
      if (inBlock && rules.block) {
        const end = line.indexOf(rules.block[1], i)
        const stop = end < 0 ? line.length : end + rules.block[1].length
        push(line.slice(i, stop), 'comment')
        i = stop
        if (end >= 0) inBlock = false
        continue
      }
      const rest = line.slice(i)
      if (rules.block && rest.startsWith(rules.block[0])) {
        inBlock = true
        push(rules.block[0], 'comment')
        i += rules.block[0].length
        continue
      }
      if (rules.line?.some((mark) => rest.startsWith(mark))) {
        push(rest, 'comment')
        break
      }
      const quote = rules.quotes?.find((q) => rest.startsWith(q))
      if (quote) {
        let j = i + 1
        while (j < line.length && line[j] !== quote) j += line[j] === '\\' ? 2 : 1
        const stop = Math.min(line.length, j + 1)
        push(line.slice(i, stop), 'string')
        i = stop
        continue
      }
      WORD.lastIndex = i
      const word = WORD.exec(line)
      if (word) {
        const text = word[0]
        const known = rules.keywords && (rules.anyCase ? rules.keywords.has(text.toLowerCase()) : rules.keywords.has(text))
        push(text, known ? 'keyword' : 'plain')
        i += text.length
        continue
      }
      NUMBER.lastIndex = i
      const number = rules.keywords ? NUMBER.exec(line) : null
      if (number) {
        push(number[0], 'number')
        i += number[0].length
        continue
      }
      push(line[i], 'plain')
      i += 1
    }
    return out.length > 0 ? out : [{ text: '', kind: 'plain' }]
  })
}
