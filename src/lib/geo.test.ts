// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { currentLocation } from './geo'

// Where a timer start comes from (Admin and help, slice 5): the browser's place, or why there's none.

const stub = (geolocation: unknown) => Object.defineProperty(navigator, 'geolocation', { value: geolocation, configurable: true })
afterEach(() => stub(undefined))

describe('currentLocation', () => {
  it('gives the fix, rounded, to within its accuracy', async () => {
    stub({ getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 30.044412345, longitude: 31.235712345, accuracy: 18.4 } } as GeolocationPosition) })
    expect(await currentLocation()).toEqual({ lat: 30.04441, lng: 31.23571, accuracy: 18 })
  })

  it('blocked when the person said no; none when there is no fix or no way to get one', async () => {
    stub({ getCurrentPosition: (_: unknown, fail: PositionErrorCallback) => fail({ code: 1 } as GeolocationPositionError) })
    expect(await currentLocation()).toBe('blocked')
    stub({ getCurrentPosition: (_: unknown, fail: PositionErrorCallback) => fail({ code: 3 } as GeolocationPositionError) })
    expect(await currentLocation()).toBe('none')
    stub(undefined)
    expect(await currentLocation()).toBe('none')
  })

  it('never waits past its limit, even when the browser never answers', async () => {
    vi.useFakeTimers()
    stub({ getCurrentPosition: () => {} })
    const pending = currentLocation(5000)
    await vi.advanceTimersByTimeAsync(5000)
    expect(await pending).toBe('none')
    vi.useRealTimers()
  })
})
