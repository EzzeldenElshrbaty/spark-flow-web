import { describe, expect, it } from 'vitest'
import { canRecord, pickMimeType, recordErrorOf, waveformOf } from './recorder'

describe('the recorder (chat spec 6.9)', () => {
  it('picks the first format the browser records', () => {
    expect(pickMimeType('voice', () => true)).toBe('audio/webm;codecs=opus')
    expect(pickMimeType('voice', (t) => t !== 'audio/webm;codecs=opus')).toBe('audio/mp4')
    expect(pickMimeType('voice', (t) => t === 'audio/ogg;codecs=opus')).toBe('audio/ogg;codecs=opus')
    expect(pickMimeType('voice', () => false)).toBeNull()
    expect(pickMimeType('video', () => true)).toBe('video/webm;codecs=vp9,opus')
    expect(pickMimeType('video', (t) => !t.includes('vp9'))).toBe('video/webm;codecs=vp8,opus')
    expect(pickMimeType('video', (t) => t === 'video/mp4')).toBe('video/mp4')
  })

  it('turns the levels into 48 bars, the loudest at 1', () => {
    const levels = Array.from({ length: 480 }, (_, i) => (i % 97) / 200)
    const bars = waveformOf(levels)
    expect(bars).toHaveLength(48)
    expect(bars.every((v) => v >= 0 && v <= 1 && Math.round(v * 100) / 100 === v)).toBe(true)
    expect(Math.max(...bars)).toBe(1)
  })

  it('silence, a few levels or none still make 48 bars', () => {
    expect(waveformOf(Array(100).fill(0))).toEqual(Array(48).fill(0))
    expect(waveformOf([])).toEqual(Array(48).fill(0))
    const few = waveformOf([0.1, 0.2, 0.4, 0.8, 0.4, 0.2, 0.1, 0.05, 0.1, 0.2])
    expect(few).toHaveLength(48)
    expect(Math.max(...few)).toBe(1)
  })

  it('names why a recording couldn’t start', () => {
    const named = (name: string) => recordErrorOf(new DOMException('x', name))
    expect([named('NotAllowedError'), named('SecurityError')]).toEqual(['denied', 'denied'])
    expect([named('NotFoundError'), named('OverconstrainedError')]).toEqual(['missing', 'missing'])
    expect(named('NotReadableError')).toBe('busy')
    expect(recordErrorOf(new Error('boom'))).toBe('failed')
    expect(recordErrorOf('denied')).toBe('denied')
  })

  it('can’t record without the browser’s media devices', () => {
    expect(canRecord('voice')).toBe(false)
    expect(canRecord('video')).toBe(false)
  })
})
