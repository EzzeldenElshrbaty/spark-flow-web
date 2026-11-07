import { describe, expect, it } from 'vitest'
import { bodyTaskKeys, bodyText, descriptionText, isJumbo, mentionsOf, parseBody, textBody, validBody, validDescription } from './messageBody'

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

describe('@channel and @here (spec 6.8)', () => {
  it('parse as the all and here groups, read back as @channel and @here, and are valid stored nodes', () => {
    const body = parseBody('@channel and @here, also @all')
    expect(body).toEqual([{ type: 'p', children: [{ type: 'all' }, { type: 'text', text: ' and ' }, { type: 'here' }, { type: 'text', text: ', also ' }, { type: 'all' }] }])
    expect(bodyText(body)).toBe('@channel and @here, also @channel')
    expect(mentionsOf(body)).toEqual([{ kind: 'all', id: 'all' }, { kind: 'here', id: 'here' }])
    expect(validBody([{ type: 'p', children: [{ type: 'here' }] }])).toEqual([{ type: 'p', children: [{ type: 'here' }] }])
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

describe('validBody (the server takes a body from the composer; spec §7)', () => {
  it('refuses a body of more than 10,000 nodes, however little text they hold (every viewer would draw them all)', () => {
    const empties = (n: number) => Array.from({ length: n }, () => ({ type: 'text', text: '' }))
    expect(validBody([{ type: 'p', children: empties(9_999) }])).not.toBeNull()
    expect(validBody([{ type: 'p', children: empties(10_000) }])).toBeNull()
    expect(validBody([{ type: 'ul', items: Array.from({ length: 10_000 }, () => []) }])).toBeNull()
    expect(validBody([{ type: 'quote', children: Array.from({ length: 1_000 }, () => ({ type: 'p', children: empties(10) })) }])).toBeNull()
  })

  it('keeps a well-formed body as it is', () => {
    const body = parseBody('*Hi* @[Nour](u-2) in #[backend](c-backend), see https://spark-sys.com\n\n> q\n- a\n1. b\n```\nc\n```')
    expect(validBody(body)).toEqual(body)
  })
  it('refuses what is not a body: wrong types, unknown nodes or marks, script links, odd ids', () => {
    for (const bad of [
      null, 'text', {}, [{ type: 'h1', children: [] }],
      [{ type: 'p', children: [{ type: 'text', text: 1 }] }],
      [{ type: 'p', children: [{ type: 'text', text: 'x', marks: ['blink'] }] }],
      [{ type: 'p', children: [{ type: 'link', href: 'javascript:alert(1)', text: 'x' }] }],
      [{ type: 'p', children: [{ type: 'user', id: '<b>', name: 'x' }] }],
      [{ type: 'quote', children: [{ type: 'quote', children: [] }] }],
    ])
      expect(validBody(bad), JSON.stringify(bad)).toBeNull()
  })
  it('drops fields it does not know', () => {
    expect(validBody([{ type: 'p', children: [{ type: 'text', text: 'x', style: 'color:red' }], onclick: 'x' }])).toEqual([{ type: 'p', children: [{ type: 'text', text: 'x' }] }])
  })
})

describe('mentionsOf and bodyTaskKeys', () => {
  it('lists people, everyone, projects and tasks a body names, each once, in order', () => {
    const body = parseBody('@[Nour](u-2) @all @NEX NEX-1 @[Nour](u-2) MOB-2 NEX-1')
    expect(mentionsOf(body)).toEqual([
      { kind: 'user', id: 'u-2' }, { kind: 'all', id: 'all' }, { kind: 'project', id: 'NEX' }, { kind: 'task', id: 'NEX-1' }, { kind: 'task', id: 'MOB-2' },
    ])
    expect(bodyTaskKeys(body)).toEqual(['NEX-1', 'MOB-2'])
  })
})

describe('description body (task description)', () => {
  const file = { type: 'file', id: 'a-1' }
  const ids = new Set(['a-1'])

  it('keeps a description of text, links, quotes, lists, code and files', () => {
    const body = [
      p(text('b', ['b']), { type: 'link', href: 'https://a.b', text: 'a.b' }),
      { type: 'quote', children: [p(text('q'))] },
      { type: 'ul', items: [[text('x')]] },
      { type: 'ol', items: [[text('y')]] },
      { type: 'code', text: 'c' },
      file,
    ]
    expect(validDescription(body, ids)).toEqual(body)
  })

  it('refuses mentions and chips: a description holds text and links only', () => {
    for (const inline of [
      { type: 'user', id: 'u-1', name: 'A' },
      { type: 'all' },
      { type: 'here' },
      { type: 'channel', id: 'c-1', name: 'c' },
      { type: 'task', key: 'NEX-1' },
      { type: 'project', key: 'NEX' },
    ])
      expect(validDescription([p(inline)], ids)).toBeNull()
  })

  it('refuses unknown or misplaced files, script links and too many blocks', () => {
    expect(validDescription([{ type: 'file', id: 'a-2' }], ids)).toBeNull()
    expect(validDescription([{ type: 'quote', children: [file] }], ids)).toBeNull()
    expect(validDescription([{ type: 'file', id: '../x' }], new Set(['../x']))).toBeNull()
    expect(validDescription([p({ type: 'link', href: 'javascript:alert(1)', text: 'x' })], ids)).toBeNull()
    expect(validDescription(Array.from({ length: 2001 }, () => p(text('a'))), ids)).toBeNull()
  })

  it('chat bodies still refuse file blocks', () => {
    expect(validBody([file])).toBeNull()
  })

  it('reads as plain text with blocks a blank line apart and files left out', () => {
    expect(descriptionText([p(text('a')), file, { type: 'ul', items: [[text('x')], [text('y')]] }, { type: 'code', text: 'c' }] as never)).toBe('a\n\nx\ny\n\nc')
  })

  it('turns plain text into paragraphs at blank lines, keeping line breaks and the text as typed', () => {
    expect(textBody('a\nb\n\n\nc')).toEqual([p(text('a\nb')), p(text('c'))])
    expect(textBody('  \n ')).toEqual([])
    expect(textBody('*x* https://a.b NEX-1')).toEqual([p(text('*x* https://a.b NEX-1'))])
  })

  it('round-trips a plain description through its text', () => {
    const s = 'one\ntwo\n\nthree'
    expect(textBody(descriptionText(textBody(s)))).toEqual(textBody(s))
  })
})
