import { describe, expect, it } from 'vitest'
import { mainCardClass } from '@/layout/mainCard'

describe('mainCardClass (spec 5.3: the main card is on surface)', () => {
  it('a chat pane (a channel, Activity) puts the card on the chat surface, inside the chat tokens', () => {
    expect(mainCardClass(true).split(' ')).toEqual(expect.arrayContaining(['sf', 'lg:bg-sf-surface']))
    expect(mainCardClass(true)).not.toContain('bg-canvas')
  })

  it('other pages keep their own canvas', () => {
    expect(mainCardClass(false).split(' ')).toContain('lg:bg-canvas')
    expect(mainCardClass(false).split(' ')).not.toContain('sf')
  })
})
