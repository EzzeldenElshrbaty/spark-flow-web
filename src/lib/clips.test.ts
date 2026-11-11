import { describe, expect, it } from 'vitest'
import { clipLabel, clipMaxMs, clipName } from './clips'

describe('voice and video clips (chat spec 6.9)', () => {
  const at = new Date(2026, 10, 11, 14, 32)

  it('names a recording by its kind, when it was made and its format', () => {
    expect(clipName('voice', at, 'audio/webm;codecs=opus')).toBe('Voice message 11 Nov 2026 2.32 PM.webm')
    expect(clipName('voice', at, 'audio/mp4')).toBe('Voice message 11 Nov 2026 2.32 PM.m4a')
    expect(clipName('voice', at, 'audio/ogg;codecs=opus')).toBe('Voice message 11 Nov 2026 2.32 PM.ogg')
    expect(clipName('video', at, 'video/webm;codecs=vp9,opus')).toBe('Video message 11 Nov 2026 2.32 PM.webm')
    expect(clipName('video', at, 'video/mp4')).toBe('Video message 11 Nov 2026 2.32 PM.mp4')
  })

  it('labels a clip with its kind and length', () => {
    expect(clipLabel({ kind: 'voice', durationMs: 42_000, waveform: [] })).toBe('Voice message · 0:42')
    expect(clipLabel({ kind: 'video', durationMs: 42_000, waveform: [] })).toBe('Video message · 0:42')
  })

  it('voice may run 5 minutes, video 2', () => {
    expect(clipMaxMs('voice')).toBe(300_000)
    expect(clipMaxMs('video')).toBe(120_000)
  })
})
