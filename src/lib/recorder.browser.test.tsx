import { describe, expect, it, vi } from 'vitest'
import { canRecord, startRecording } from './recorder'

// Chromium's fake microphone and camera (vite.config.ts launch flags): a real recording, about a second long.

describe('recording in the browser (chat spec 6.9)', () => {
  it('records a voice message and switches the microphone off after', async () => {
    expect(canRecord('voice')).toBe(true)
    const onLimit = vi.fn()
    const recorder = await startRecording('voice', { maxMs: 5000, onLimit })
    await new Promise((resolve) => setTimeout(resolve, 1200))
    expect(recorder.elapsedMs()).toBeGreaterThanOrEqual(1000)
    const recording = await recorder.stop()
    expect(recording.blob.size).toBeGreaterThan(0)
    expect(recording.mimeType).toMatch(/^audio\//)
    expect(recording.durationMs).toBeGreaterThanOrEqual(1000)
    expect(recording.waveform).toHaveLength(48)
    expect(recorder.stream.getTracks().every((track) => track.readyState === 'ended')).toBe(true)
    expect(onLimit).not.toHaveBeenCalled()
  })

  it('stops by itself at its limit and says so', async () => {
    const onLimit = vi.fn()
    const recorder = await startRecording('voice', { maxMs: 400, onLimit })
    await vi.waitFor(() => expect(onLimit).toHaveBeenCalledOnce(), { timeout: 3000 })
    const recording = await recorder.stop()
    expect(recording.durationMs).toBeLessThan(1000)
    expect(recorder.stream.getTracks().every((track) => track.readyState === 'ended')).toBe(true)
  })

  it('a stream that arrives after Cancel is switched off at once', async () => {
    const stop = vi.spyOn(MediaStreamTrack.prototype, 'stop')
    const controller = new AbortController()
    const starting = startRecording('voice', { maxMs: 5000, onLimit: () => {}, signal: controller.signal })
    controller.abort()
    await expect(starting).rejects.toBe('failed')
    expect(stop).toHaveBeenCalled()
    stop.mockRestore()
  })

  it('a video message records too', async () => {
    expect(canRecord('video')).toBe(true)
    const recorder = await startRecording('video', { maxMs: 5000, onLimit: () => {} })
    expect(recorder.stream.getVideoTracks()).toHaveLength(1)
    await new Promise((resolve) => setTimeout(resolve, 600))
    const recording = await recorder.stop()
    expect(recording.mimeType).toMatch(/^video\//)
    expect(recording.waveform).toEqual([])
  })
})
