import { describe, expect, it } from 'vitest'
import { isFill, mainCardClass, screenFont } from '@/layout/mainCard'

describe('mainCardClass (spec 5.3: the main card is on surface)', () => {
  it('a chat pane (a channel, Activity) puts the card on the chat surface, inside the chat tokens', () => {
    expect(mainCardClass(true).split(' ')).toEqual(expect.arrayContaining(['sf', 'lg:bg-sf-surface']))
    expect(mainCardClass(true)).not.toContain('bg-canvas')
  })

  it('the card takes the kit’s corner (UX Phase 3, 3.5)', () => {
    for (const pane of [true, false]) expect(mainCardClass(pane).split(' ')).toContain('lg:rounded-2xl')
  })

  it('other pages keep their own canvas', () => {
    expect(mainCardClass(false).split(' ')).toContain('lg:bg-canvas')
    expect(mainCardClass(false).split(' ')).not.toContain('sf')
  })
})

describe('isFill (UX Phase 1, 1.3: a page that fills the card)', () => {
  const match = (handle: unknown, params: Record<string, string>) => ({ handle, params })
  it('a handle with fill: true fills; a function decides from the address', () => {
    expect(isFill([match({ fill: true }, {})])).toBe(true)
    const chatOnly = { fill: (p: Record<string, string | undefined>) => p.tab === 'chat' }
    expect(isFill([match(undefined, {}), match(chatOnly, { tab: 'chat' })])).toBe(true)
    expect(isFill([match(chatOnly, { tab: 'tasks' })])).toBe(false)
    expect(isFill([match({ pane: true }, {})])).toBe(false)
  })
})

describe('screenFont (UX Phase 3, 3.1: one font per screen)', () => {
  it('chat pages are chat screens; every other page, the project Chat tab included, is a page', () => {
    // A channel, Activity, Search: their routes are chat panes.
    expect(screenFont(true)).toBe('chat')
    // Every other page, the project Chat tab included: it sits under the project's own (kit) header (final review).
    expect(screenFont(false)).toBe('page')
  })
})
