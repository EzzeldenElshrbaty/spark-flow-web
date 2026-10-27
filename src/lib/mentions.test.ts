import { describe, expect, it } from 'vitest'
import { parseMentions, parseTicketKeys, segments } from './mentions'

describe('parseTicketKeys', () => {
  it('returns unique keys in the order they first appear', () => {
    expect(parseTicketKeys('NEX-104 waits on MOB-101, then NEX-104 again and BRD-7')).toEqual(['NEX-104', 'MOB-101', 'BRD-7'])
  })

  it('ignores lowercase, single letters, over-long prefixes and keys glued to other words', () => {
    expect(parseTicketKeys('nex-104 A-1 ABCDEF-1 xNEX-104 NEX-104x and no key')).toEqual([])
  })

  it('returns an empty list for text without keys', () => {
    expect(parseTicketKeys('')).toEqual([])
  })
})

describe('parseMentions', () => {
  it('reads @all, @[Name](userId), @PROJECTKEY and @TASK-KEY once each, in order', () => {
    expect(parseMentions('@all ship @MOB-104 then @MOB, ask @[Mariam Fathy](u-3) and @all again')).toEqual([
      { kind: 'all', id: 'all' },
      { kind: 'task', id: 'MOB-104' },
      { kind: 'project', id: 'MOB' },
      { kind: 'user', id: 'u-3' },
    ])
  })

  it('ignores e-mail addresses, lowercase keys and bare words', () => {
    expect(parseMentions('mail ops@spark-sys.com about @mob-1 and @everyone')).toEqual([])
  })
})

describe('segments', () => {
  const known = { userIds: new Set(['u-2']), taskKeys: new Set(['NEX-101']), projectKeys: new Set(['NEX']), nameOf: (id: string) => (id === 'u-2' ? 'Nour El-Sayed' : id) }
  it('segments leaves unknown and e-mail text as text', () => {
    expect(segments('Hey @[Nour](u-2), see @NEX-101 in @NEX; @NEX-999 @ZZZ @[Ghost](u-x) a@b.com @all', known)).toEqual([
      { kind: 'text', text: 'Hey ' },
      { kind: 'user', userId: 'u-2', name: 'Nour El-Sayed' },
      { kind: 'text', text: ', see ' },
      { kind: 'task', key: 'NEX-101' },
      { kind: 'text', text: ' in ' },
      { kind: 'project', key: 'NEX' },
      { kind: 'text', text: '; @NEX-999 @ZZZ @Ghost a@b.com ' },
      { kind: 'all' },
    ])
  })
  it('plain text stays one segment', () => {
    expect(segments('<b>hi</b>', known)).toEqual([{ kind: 'text', text: '<b>hi</b>' }])
  })
})

import { unnamedKeys } from './mentions'

describe('unnamedKeys', () => {
  it('a chip for NEX-10 even when the text names NEX-101', () => {
    expect(unnamedKeys('See NEX-101', ['NEX-10', 'NEX-101'])).toEqual(['NEX-10'])
  })
})
