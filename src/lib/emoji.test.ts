import { afterEach, describe, expect, it } from 'vitest'
import { EMOJI_CATEGORIES, emojiInfo, rememberEmoji, recentEmoji, searchEmoji } from './emoji'
import { isOneEmoji } from './emojiText'

afterEach(() => localStorage.clear())

describe('emoji set (spec 6.6 picker)', () => {
  it('has the spec categories in order, each emoji one emoji with a name and an alias', () => {
    expect(EMOJI_CATEGORIES.map((c) => c.label)).toEqual(['Smileys & people', 'Nature', 'Food', 'Activities', 'Travel', 'Objects', 'Symbols', 'Flags'])
    const all = EMOJI_CATEGORIES.flatMap((c) => c.emoji)
    expect(all.length).toBeGreaterThan(200)
    for (const e of all) {
      expect(isOneEmoji(e.char), e.char).toBe(true)
      expect(e.name.length).toBeGreaterThan(0)
      expect(e.aliases[0]).toMatch(/^[a-z0-9_+-]+$/)
    }
    expect(new Set(all.map((e) => e.char)).size).toBe(all.length)
  })

  it('looks emoji up by character', () => {
    expect(emojiInfo('👍')).toMatchObject({ name: 'thumbs up', aliases: ['thumbsup', '+1'] })
    expect(emojiInfo('🦄🦄')).toBeUndefined()
  })

  it('searches names and aliases, best match first', () => {
    expect(searchEmoji('thumb').map((e) => e.char)).toEqual(expect.arrayContaining(['👍', '👎']))
    expect(searchEmoji('+1')[0].char).toBe('👍')
    expect(searchEmoji('tada')[0].char).toBe('🎉')
    expect(searchEmoji('HEART').map((e) => e.char)).toContain('❤️')
    expect(searchEmoji('zzqx')).toEqual([])
    expect(searchEmoji('  ')).toEqual([])
  })
})

// The node test environment has no localStorage: give it one.
const store = new Map<string, string>()
globalThis.localStorage ??= {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage

describe('frequently used (kept in this browser)', () => {
  it('starts with the quick reactions, then puts what I use first, each once, at most 18', () => {
    expect(recentEmoji()).toEqual(['👍', '❤️', '😂', '🎉', '👀', '✅'])
    rememberEmoji('🐍')
    rememberEmoji('👍')
    expect(recentEmoji().slice(0, 3)).toEqual(['👍', '🐍', '❤️'])
    for (const e of '😀😃😄😁😆😅🤣😊😇🙂🙃😉😌😍🥰😘😗😙') rememberEmoji(e)
    expect(recentEmoji()).toHaveLength(18)
  })

  it('ignores a broken stored list', () => {
    localStorage.setItem('spark-flow.emoji.recent', '{nope')
    expect(recentEmoji()).toEqual(['👍', '❤️', '😂', '🎉', '👀', '✅'])
  })
})
