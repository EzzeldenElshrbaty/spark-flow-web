import { describe, expect, it } from 'vitest'
import type { Inline } from '@/lib/messageBody'
import { MAX_PAGE_BLOCKS, MAX_PAGE_TEXT, pageAsBody, pageMentions, pageText, pageTooLong, validPage, type PageBody } from '@/lib/pageBody'

const t = (text: string): Inline => ({ type: 'text', text })
const p = (...children: Inline[]) => ({ type: 'p' as const, children })
const cell = (text: string): Inline[] => [t(text)]

describe('validPage', () => {
  it('accepts every block type', () => {
    const body: PageBody = [
      p(t('Hello '), { type: 'user', id: 'u-2', name: 'Nour El-Sayed' }),
      { type: 'quote', children: [p(t('Quoted'))] },
      { type: 'ul', items: [cell('One'), cell('Two')] },
      { type: 'ol', items: [cell('First')] },
      { type: 'code', text: 'npm test' },
      { type: 'h1', children: [t('Plan')] },
      { type: 'h2', children: [t('Goals')] },
      { type: 'h3', children: [{ type: 'text', text: 'Notes', marks: ['b'] }] },
      { type: 'check', items: [{ checked: true, children: cell('Ship it') }, { checked: false, children: cell('Tell people') }] },
      { type: 'table', rows: [[cell('A'), cell('B')], [cell('C'), [{ type: 'task', key: 'NEX-1' }]]] },
    ]
    expect(validPage(body)).toEqual(body)
  })

  it('refuses @channel and @here on a page', () => {
    expect(validPage([p({ type: 'all' })])).toBeNull()
    expect(validPage([p({ type: 'here' })])).toBeNull()
    expect(validPage([{ type: 'table', rows: [[[{ type: 'all' }]]] }])).toBeNull()
    expect(pageTooLong([p({ type: 'all' })])).toBe(false)
  })

  it('refuses a ragged, empty or oversized table', () => {
    const ragged = [{ type: 'table', rows: [[cell('A'), cell('B')], [cell('C'), cell('D'), cell('E')]] }]
    const empty = [{ type: 'table', rows: [] }]
    const wide = [{ type: 'table', rows: [Array.from({ length: 11 }, (_, n) => cell(`${n}`))] }]
    const long = [{ type: 'table', rows: Array.from({ length: 101 }, () => [cell('x')]) }]
    for (const body of [ragged, empty, wide, long]) expect(validPage(body)).toBeNull()
    expect([ragged, empty, wide, long].map(pageTooLong)).toEqual([false, false, true, true])
  })

  it('refuses past the limits', () => {
    const many = Array.from({ length: MAX_PAGE_BLOCKS + 1 }, () => p(t('x')))
    const longText = [p(t('x'.repeat(MAX_PAGE_TEXT + 1)))]
    expect(validPage(many)).toBeNull()
    expect(pageTooLong(many)).toBe(true)
    expect(validPage(longText)).toBeNull()
    expect(pageTooLong(longText)).toBe(true)
    const justFits = [p(t('x'.repeat(MAX_PAGE_TEXT)))]
    expect(validPage(justFits)).toEqual(justFits)
    expect(pageTooLong(justFits)).toBe(false)
  })

  it('refuses what isn’t a page', () => {
    expect(validPage('hello')).toBeNull()
    expect(validPage([{ type: 'h4', children: [] }])).toBeNull()
    expect(validPage([{ type: 'check', items: [{ checked: 'yes', children: [] }] }])).toBeNull()
    expect(pageTooLong('hello')).toBe(false)
  })
})

describe('reading a page', () => {
  it('pageText reads every block', () => {
    const body: PageBody = [
      { type: 'h2', children: [t('Plan')] },
      { type: 'check', items: [{ checked: true, children: cell('Ship it') }] },
      { type: 'table', rows: [[cell('A'), cell('B')], [cell('C'), cell('D')]] },
    ]
    expect(pageText(body)).toBe('Plan\n☑ Ship it\nA\tB\nC\tD')
    expect(pageText([{ type: 'check', items: [{ checked: false, children: cell('Later') }] }])).toBe('☐ Later')
  })

  it('pageAsBody hands chat its inlines (a task in a heading, a check item and a cell)', () => {
    const task = (key: string): Inline[] => [{ type: 'task', key }]
    const body: PageBody = [{ type: 'h1', children: task('NEX-1') }, { type: 'check', items: [{ checked: false, children: task('NEX-2') }] }, { type: 'table', rows: [[task('NEX-3')]] }]
    expect(pageAsBody(body)).toEqual([{ type: 'p', children: task('NEX-1') }, { type: 'ul', items: [task('NEX-2')] }, { type: 'ul', items: [task('NEX-3')] }])
  })

  it('pageMentions lists people once, in order', () => {
    const u = (id: string): Inline => ({ type: 'user', id, name: id })
    const body: PageBody = [p(u('u-2')), { type: 'h1', children: [u('u-1')] }, { type: 'table', rows: [[[u('u-2')]]] }]
    expect(pageMentions(body)).toEqual(['u-2', 'u-1'])
  })
})
