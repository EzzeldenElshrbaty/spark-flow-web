import { afterEach, describe, expect, it, vi } from 'vitest'
import { play, stopped } from './clipPlayback'

afterEach(() => {
  stopped('a')
  stopped('b')
})

describe('one recording plays at a time (chat spec 6.9)', () => {
  it('playing another pauses the one before', () => {
    const pauseA = vi.fn()
    const pauseB = vi.fn()
    play('a', pauseA)
    play('b', pauseB)
    expect(pauseA).toHaveBeenCalledOnce()
    expect(pauseB).not.toHaveBeenCalled()
  })

  it('once one has stopped, the next pauses nothing', () => {
    const pauseB = vi.fn()
    play('b', pauseB)
    stopped('b')
    play('a', vi.fn())
    expect(pauseB).not.toHaveBeenCalled()
  })

  it('playing the same one again pauses nothing', () => {
    const pauseA = vi.fn()
    play('a', pauseA)
    play('a', pauseA)
    expect(pauseA).not.toHaveBeenCalled()
  })
})
