import { describe, expect, it } from 'vitest'
import { bodyText, isJumbo, parseBody } from './messageBody'

const p = (...children: unknown[]) => ({ type: 'p', children })
const text = (t: string, marks?: string[]) => (marks ? { type: 'text', text: t, marks } : { type: 'text', text: t })

describe('parseBody (spec 6.3 body, §7 structured rich text)', () => {
  it('splits paragraphs on blank lines and keeps single line breaks', () => {
    expect(parseBody('one\ntwo\n\nthree')).toEqual([p(text('one\ntwo')), p(text('three'))])
  })

  it('reads *bold*, _italic_, ~strike~ and `code`, nested where it makes sense', () => {
    expect(parseBody('a *b* _i_ ~s~ `c` *_bi_*')).toEqual([
      p(text('a '), text('b', ['b']), text(' '), text('i', ['i']), text(' '), text('s', ['s']), text(' '), text('c', ['code']), text(' '), text('bi', ['b', 'i'])),
    ])
  })

  it('leaves markers alone when they are not around a word', () => {
    expect(parseBody('2 * 3 * 4 and snake_case_name')).toEqual([p(text('2 * 3 * 4 and snake_case_name'))])
  })

  it('code takes the text as written, markers and mentions included', () => {
    expect(parseBody('`*not bold* @all NEX-1`')).toEqual([p(text('*not bold* @all NEX-1', ['code']))])
  })

  it('reads code blocks, quotes and lists', () => {
    expect(parseBody('```\nconst a = 1\n  b\n```\n> quoted *line*\n> two\n- one\n- two\n1. first\n2. second')).toEqual([
      { type: 'code', text: 'const a = 1\n  b' },
      { type: 'quote', children: [p(text('quoted '), text('line', ['b']), text('\ntwo'))] },
      { type: 'ul', items: [[text('one')], [text('two')]] },
      { type: 'ol', items: [[text('first')], [text('second')]] },
    ])
  })

  it('an unclosed code fence runs to the end', () => {
    expect(parseBody('```\nx')).toEqual([{ type: 'code', text: 'x' }])
  })

  it('turns mentions, channel links, task keys and links into their own nodes', () => {
    expect(parseBody('@[Nour](u-2) and @all in #[backend](c-backend): NEX-103, @MOB-7, see https://spark-sys.com/x?a=1.')).toEqual([
      p(
        { type: 'user', id: 'u-2', name: 'Nour' },
        text(' and '),
        { type: 'all' },
        text(' in '),
        { type: 'channel', id: 'c-backend', name: 'backend' },
        text(': '),
        { type: 'task', key: 'NEX-103' },
        text(', '),
        { type: 'task', key: 'MOB-7' },
        text(', see '),
        { type: 'link', href: 'https://spark-sys.com/x?a=1', text: 'https://spark-sys.com/x?a=1' },
        text('.'),
      ),
    ])
  })

  it('a project mention stays a project, and keys follow the spec pattern (letters then letters or digits)', () => {
    expect(parseBody('@NEX S3-12 nex-1 A-1')).toEqual([p({ type: 'project', key: 'NEX' }, text(' '), { type: 'task', key: 'S3-12' }, text(' nex-1 A-1'))])
  })

  it('only http and https become links', () => {
    expect(parseBody('javascript:alert(1) ftp://x.y')).toEqual([p(text('javascript:alert(1) ftp://x.y'))])
  })

  it('empty text is an empty body', () => {
    expect(parseBody('   ')).toEqual([])
  })
})

describe('bodyText', () => {
  it('is the body as plain text, one block a line, for search and notifications', () => {
    expect(bodyText(parseBody('*Hi* @[Nour](u-2)\n\n> in #[backend](c-backend)\n- NEX-1\n- two'))).toBe('Hi @Nour\nin #backend\nNEX-1\ntwo')
  })
})

describe('isJumbo (spec 6.3 jumbo emoji)', () => {
  it('is true for a message of only emoji (up to 23), false otherwise', () => {
    expect(isJumbo(parseBody('🎉'))).toBe(true)
    expect(isJumbo(parseBody('👍🏽 🚀 ❤️'))).toBe(true)
    expect(isJumbo(parseBody('🎉 done'))).toBe(false)
    expect(isJumbo(parseBody('1'))).toBe(false)
    expect(isJumbo(parseBody('🎉'.repeat(24)))).toBe(false)
    expect(isJumbo(parseBody('*🎉*'))).toBe(false)
  })
})
