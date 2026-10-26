import { describe, expect, it } from 'vitest'
import { parseMentions, parseTicketKeys } from './text'

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
