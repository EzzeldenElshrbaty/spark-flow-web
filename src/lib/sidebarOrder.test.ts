import { describe, expect, it } from 'vitest'
import { applyOrder, moveInOrder } from './sidebarOrder'

const row = (id: string, muted = false) => ({ id, muted })
const ids = (rows: { id: string }[]) => rows.map((r) => r.id)

describe('applyOrder (spec 5.1: my order first, the rest after in their own order, muted last)', () => {
  const rows = [row('alpha'), row('backend'), row('general'), row('zeta')]
  it('without a saved order, keeps the default (A–Z)', () => {
    expect(ids(applyOrder(rows, undefined, (r) => r.id, (r) => r.muted))).toEqual(['alpha', 'backend', 'general', 'zeta'])
  })
  it('puts the saved ones first in their order; one I joined later goes after, in its default place', () => {
    expect(ids(applyOrder(rows, ['general', 'alpha'], (r) => r.id, (r) => r.muted))).toEqual(['general', 'alpha', 'backend', 'zeta'])
  })
  it('skips saved ids that aren’t listed any more (left, unstarred, archived)', () => {
    expect(ids(applyOrder(rows, ['gone', 'zeta'], (r) => r.id, (r) => r.muted))).toEqual(['zeta', 'alpha', 'backend', 'general'])
  })
  it('muted rows still sink to the end, in my order', () => {
    const withMuted = [row('alpha', true), row('backend'), row('general', true), row('zeta')]
    expect(ids(applyOrder(withMuted, ['general', 'zeta', 'alpha', 'backend'], (r) => r.id, (r) => r.muted))).toEqual(['zeta', 'backend', 'general', 'alpha'])
  })
})

describe('moveInOrder (a drop, within its own part)', () => {
  const order = ['a', 'b', 'c', 'm1', 'm2']
  const muted = new Set(['m1', 'm2'])
  it('moves a row to where it was dropped', () => {
    expect(moveInOrder(order, 'c', 'a', muted)).toEqual(['c', 'a', 'b', 'm1', 'm2'])
    expect(moveInOrder(order, 'a', 'c', muted)).toEqual(['b', 'c', 'a', 'm1', 'm2'])
    expect(moveInOrder(order, 'm2', 'm1', muted)).toEqual(['a', 'b', 'c', 'm2', 'm1'])
  })
  it('a drop across the muted line, on itself or on nothing changes nothing', () => {
    expect(moveInOrder(order, 'a', 'm1', muted)).toBeNull()
    expect(moveInOrder(order, 'm1', 'a', muted)).toBeNull()
    expect(moveInOrder(order, 'a', 'a', muted)).toBeNull()
    expect(moveInOrder(order, 'a', null, muted)).toBeNull()
  })
})
