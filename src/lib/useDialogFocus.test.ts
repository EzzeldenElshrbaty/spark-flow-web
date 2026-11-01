import { describe, expect, it } from 'vitest'
import { wrapFocus } from './useDialogFocus'

describe('wrapFocus', () => {
  const items = ['a', 'b', 'c']
  it('wraps at the ends', () => {
    expect(wrapFocus(items, 'c', false)).toBe('a')
    expect(wrapFocus(items, 'a', true)).toBe('c')
  })
  it('leaves the middle to the browser', () => expect(wrapFocus(items, 'b', false)).toBeNull())
  it('from the panel itself (padding clicked), Tab goes to the first and Shift+Tab to the last', () => {
    expect(wrapFocus(items, 'panel', false)).toBe('a')
    expect(wrapFocus(items, 'panel', true)).toBe('c')
    expect(wrapFocus(items, null, true)).toBe('c')
  })
  it('nothing to focus', () => expect(wrapFocus([], 'panel', false)).toBeNull())
})
