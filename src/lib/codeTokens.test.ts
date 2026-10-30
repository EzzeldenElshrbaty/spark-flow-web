import { describe, expect, it } from 'vitest'
import { CODE_LANGUAGES, tokenize, type CodeToken } from '@/lib/codeTokens'

const kinds = (line: CodeToken[]) => line.filter((t) => t.kind !== 'plain').map((t) => `${t.kind}:${t.text}`)

describe('CODE_LANGUAGES (spec 6.9 snippet Type)', () => {
  it('lists Plain text first, then the languages by name', () => {
    expect(CODE_LANGUAGES.map((l) => l.label)).toEqual(['Plain text', 'Bash', 'C#', 'CSS', 'HTML', 'JavaScript', 'JSON', 'Markdown', 'Python', 'SQL', 'TypeScript', 'YAML'])
  })
})

describe('tokenize (ink weights only, spec 6.3)', () => {
  it('gives one array per line, the text unchanged, and \\r\\n counts once', () => {
    const lines = tokenize('SELECT 1;\r\nFROM t', 'sql')
    expect(lines).toHaveLength(2)
    expect(lines.map((l) => l.map((t) => t.text).join(''))).toEqual(['SELECT 1;', 'FROM t'])
  })

  it('SQL keywords in any case, numbers, strings and -- comments', () => {
    const [line] = tokenize("select id from messages where body = 'from me' and n > 50 -- latest", 'sql')
    expect(kinds(line)).toEqual(['keyword:select', 'keyword:from', 'keyword:where', "string:'from me'", 'keyword:and', 'number:50', 'comment:-- latest'])
  })

  it('a keyword inside a string stays a string; an unclosed string ends with its line', () => {
    const lines = tokenize('const s = "return it\nreturn s', 'typescript')
    expect(kinds(lines[0])).toEqual(['keyword:const', 'string:"return it'])
    expect(kinds(lines[1])).toEqual(['keyword:return'])
  })

  it('a block comment runs across lines', () => {
    const lines = tokenize('/* one\ntwo */ let x', 'typescript')
    expect(kinds(lines[0])).toEqual(['comment:/* one'])
    expect(kinds(lines[1])).toEqual(['comment:two */', 'keyword:let'])
  })

  it('Python and Bash comments start with #; YAML keys read as keywords', () => {
    expect(kinds(tokenize('def f(): # todo', 'python')[0])).toEqual(['keyword:def', 'comment:# todo'])
    expect(kinds(tokenize('echo hi # done', 'bash')[0])).toEqual(['keyword:echo', 'comment:# done'])
    expect(kinds(tokenize('  name: flow # app', 'yaml')[0])).toEqual(['keyword:name', 'comment:# app'])
  })

  it('Plain text has no tokens but its text', () => {
    expect(tokenize('SELECT "x" -- y', 'text')).toEqual([[{ text: 'SELECT "x" -- y', kind: 'plain' }]])
  })
})
