import { describe, expect, it } from 'vitest'
import { parseTicketKeys } from './text'

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
