import { describe, expect, it } from 'vitest'
import { firstLine, parseInspector, withInspector } from '@/lib/inspector'

describe('parseInspector', () => {
  it('reads a thread', () => {
    expect(parseInspector(new URLSearchParams('thread=m-1'))).toEqual({ kind: 'thread', messageId: 'm-1' })
  })

  it('normalises ticket keys', () => {
    expect(parseInspector(new URLSearchParams('ticket=%20nex-101%20'))).toEqual({ kind: 'ticket', key: 'NEX-101' })
  })

  it('prefers ticket when both are present, ignores empty values', () => {
    expect(parseInspector(new URLSearchParams('thread=m-1&ticket=NEX-1'))).toEqual({ kind: 'ticket', key: 'NEX-1' })
    expect(parseInspector(new URLSearchParams('thread=m-1&ticket=%20'))).toEqual({ kind: 'thread', messageId: 'm-1' })
    expect(parseInspector(new URLSearchParams('thread=&ticket='))).toBeNull()
    expect(parseInspector(new URLSearchParams('thread=%20%20'))).toBeNull()
    expect(parseInspector(new URLSearchParams('q=a'))).toBeNull()
  })

  it('withInspector swaps params and keeps others', () => {
    expect(withInspector(new URLSearchParams('q=a&thread=m-1'), { kind: 'ticket', key: 'NEX-1' }).toString()).toBe('q=a&ticket=NEX-1')
    expect(withInspector(new URLSearchParams('q=a&ticket=NEX-1'), null).toString()).toBe('q=a')
    expect(withInspector(new URLSearchParams('ticket=NEX-1'), { kind: 'thread', messageId: 'm-2' }).toString()).toBe('thread=m-2')
  })

  it('withInspector leaves the given params untouched', () => {
    const search = new URLSearchParams('thread=m-1')
    withInspector(search, null)
    expect(search.toString()).toBe('thread=m-1')
  })
})

describe('firstLine', () => {
  it('takes the first non-empty line', () => {
    expect(firstLine('\n  Deploy at 4 PM  \nthen tests')).toBe('Deploy at 4 PM')
  })

  it('cuts at 60 characters with an ellipsis', () => {
    const long = 'a'.repeat(70)
    expect(firstLine(long)).toBe(`${'a'.repeat(59)}…`)
    expect(firstLine(long)).toHaveLength(60)
    expect(firstLine('a'.repeat(60))).toBe('a'.repeat(60))
  })

  it('returns an empty string for blank content', () => {
    expect(firstLine('  \n ')).toBe('')
  })
})
