import { describe, expect, it } from 'vitest'
import { excerpt, filterOf, matchRanges, matches, parseQuery, personMatches, relevance, withFilter, withoutFilter } from './searchQuery'

describe('parseQuery (spec 6.12: operators and quoted phrases)', () => {
  it('reads words, phrases and every operator', () => {
    expect(parseQuery('deploy "page size" from:@nour in:#backend has:file is:thread after:2026-10-01 before:2026-10-31 Friday')).toEqual({
      words: ['deploy', 'Friday'],
      phrases: ['page size'],
      from: ['nour'],
      in: { kind: 'channel', name: 'backend' },
      has: 'file',
      thread: true,
      after: '2026-10-01',
      before: '2026-10-31',
    })
  })
  it('in:@name is a DM; an empty query is nothing', () => {
    expect(parseQuery('in:@mariam').in).toEqual({ kind: 'dm', name: 'mariam' })
    expect(parseQuery('   ')).toEqual({ words: [], phrases: [], from: [], in: null, has: null, thread: false, after: null, before: null })
  })
  it('keeps what isn’t an operator as words: unknown keys, bad values', () => {
    expect(parseQuery('has:cats after:soon note:').words).toEqual(['has:cats', 'after:soon', 'note:'])
  })
  it('an unclosed quote runs to the end as a phrase; empty quotes are nothing', () => {
    expect(parseQuery('deploy "launch plan')).toMatchObject({ words: ['deploy'], phrases: ['launch plan'] })
    expect(parseQuery('"" deploy')).toMatchObject({ words: ['deploy'], phrases: [] })
  })
  it('several from: are anyone of them', () => {
    expect(parseQuery('from:@nour from:@mariam').from).toEqual(['nour', 'mariam'])
  })
})

describe('withFilter and withoutFilter (the chips rewrite the query)', () => {
  it('adds a filter, replacing one of the same kind, and keeps the rest as typed', () => {
    expect(withFilter('deploy "page size"', 'in', '#backend')).toBe('deploy "page size" in:#backend')
    expect(withFilter('in:#general deploy', 'in', '#backend')).toBe('deploy in:#backend')
    expect(withFilter('deploy', 'is', 'thread')).toBe('deploy is:thread')
  })
  it('takes a filter out', () => {
    expect(withoutFilter('from:@nour deploy from:@mariam', 'from')).toBe('deploy')
    expect(withoutFilter('deploy', 'has')).toBe('deploy')
  })
  it('filterOf reads the chip’s value back', () => {
    expect(filterOf('deploy in:#backend', 'in')).toBe('#backend')
    expect(filterOf('deploy', 'in')).toBeNull()
  })
})

describe('matching (word starts, case and accents ignored)', () => {
  const q = parseQuery('deploy "page size"')
  it('every word and phrase must be there, at the start of a word', () => {
    expect(matches('Deploys go out at page size 100', q)).toBe(true)
    expect(matches('Redeploy at page size 100', q)).toBe(false)
    expect(matches('Deploys go out', q)).toBe(false)
  })
  it('ignores accents and Arabic marks', () => {
    expect(matches('Café opening', parseQuery('cafe'))).toBe(true)
    expect(matches('مَرْحَبًا بالفريق', parseQuery('مرحبا'))).toBe(true)
  })
  it('folds without the locale (a Turkish browser still finds “Info”)', () => {
    expect(matches('Info desk', parseQuery('info'))).toBe(true)
  })
  it('a match inside a character that unfolds to several still highlights that character', () => {
    expect(matchRanges('½ cup', parseQuery('1'))).toEqual([[0, 1]])
    expect(matchRanges('🚀 Deploy', parseQuery('deploy'))).toEqual([[3, 9]])
  })
  it('a query of filters only matches any text', () => {
    expect(matches('anything', parseQuery('from:@nour'))).toBe(true)
  })
  it('gives the ranges to highlight in the original text, merged and in order', () => {
    expect(matchRanges('Café deploys, then deploy again', parseQuery('deploy café'))).toEqual([
      [0, 4],
      [5, 11],
      [19, 25],
    ])
    expect(matchRanges('page size page', parseQuery('"page size" page'))).toEqual([
      [0, 9],
      [10, 14],
    ])
  })
  it('relevance: more matches, and a phrase, count for more', () => {
    expect(relevance('deploy deploy', parseQuery('deploy'))).toBeGreaterThan(relevance('deploy once', parseQuery('deploy')))
    expect(relevance('page size', parseQuery('"page size"'))).toBeGreaterThan(relevance('page size', parseQuery('page size')))
  })
})

describe('excerpt (about 240 characters around the first match)', () => {
  it('keeps short text whole', () => {
    expect(excerpt('Deploy now', [[0, 6]])).toEqual({ text: 'Deploy now', ranges: [[0, 6]] })
  })
  it('keeps the part of a highlight inside the cut, and never cuts an emoji in half at the end', () => {
    const text = `${'a'.repeat(100)} ${'b'.repeat(140)}🚀${'c'.repeat(100)}`
    const cut = excerpt(text, [[101, 260]], 240)
    expect(cut.ranges).toHaveLength(1)
    const [[s, e]] = cut.ranges
    expect(e).toBeGreaterThan(s)
    expect(cut.text.slice(0, -1)).not.toMatch(/[\uD800-\uDBFF]$/)
  })
  it('cuts long text around the first match, with … and the ranges moved along', () => {
    const text = `${'a'.repeat(300)} deploy ${'b'.repeat(300)}`
    const cut = excerpt(text, [[301, 307]])
    expect(cut.text.length).toBeLessThanOrEqual(242)
    expect(cut.text.startsWith('…')).toBe(true)
    expect(cut.text.endsWith('…')).toBe(true)
    const [[s, e]] = cut.ranges
    expect(cut.text.slice(s, e)).toBe('deploy')
  })
})

describe('personMatches (from:@nour)', () => {
  const nour = { name: 'Nour El-Sayed', email: 'nour.elsayed@spark-sys.com' }
  it('the first name or the email name, from its start', () => {
    expect(personMatches(nour, 'nour')).toBe(true)
    expect(personMatches(nour, 'nour.el')).toBe(true)
    expect(personMatches(nour, 'sayed')).toBe(false)
    expect(personMatches({ name: 'Youssef', email: '' }, 'yous')).toBe(true)
  })
})
