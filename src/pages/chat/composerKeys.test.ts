import { describe, expect, it } from 'vitest'
import { shouldSendOnEnter } from './composerKeys'

const key = (over: Partial<{ key: string; shiftKey: boolean; isComposing: boolean }> = {}) => ({ key: 'Enter', shiftKey: false, isComposing: false, ...over })

describe('shouldSendOnEnter', () => {
  it('Enter sends on a mouse; on a touch screen it makes a new line', () => {
    expect(shouldSendOnEnter(key(), false)).toBe(true)
    expect(shouldSendOnEnter(key(), true)).toBe(false)
    expect(shouldSendOnEnter(key({ shiftKey: true }), false)).toBe(false)
    expect(shouldSendOnEnter(key({ isComposing: true }), false)).toBe(false)
    expect(shouldSendOnEnter(key({ key: 'a' }), false)).toBe(false)
  })
})
