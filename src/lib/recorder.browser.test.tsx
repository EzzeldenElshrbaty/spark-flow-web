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
    // The fake microphone plays a tone: some bar is above silence (final review).
    expect(recording.waveform.some((bar) => bar > 0)).toBe(true)
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

  it('a device that goes away stops it, keeping what was recorded (final review)', async () => {
    const onEnded = vi.fn()
    const recorder = await startRecording('voice', { maxMs: 5000, onLimit: () => {}, onEnded })
    await new Promise((resolve) => setTimeout(resolve, 400))
    recorder.stream.getAudioTracks()[0]!.dispatchEvent(new Event('ended'))
    await vi.waitFor(() => expect(onEnded).toHaveBeenCalledOnce())
    const recording = await recorder.stop()
    expect(recording.blob.size).toBeGreaterThan(0)
    expect(recorder.stream.getTracks().every((track) => track.readyState === 'ended')).toBe(true)
  })

  it('Stop right after starting still gives a recording that can be sent (final review)', async () => {
    const recorder = await startRecording('voice', { maxMs: 5000, onLimit: () => {} })
    const recording = await recorder.stop()
    expect(recording.durationMs).toBeGreaterThanOrEqual(1)
  })

  it('a recorder that can’t start switches the microphone off (final review)', async () => {
    const start = vi.spyOn(MediaRecorder.prototype, 'start').mockImplementation(() => {
      throw new DOMException('no', 'InvalidStateError')
    })
    const stop = vi.spyOn(MediaStreamTrack.prototype, 'stop')
    await expect(startRecording('voice', { maxMs: 5000, onLimit: () => {} })).rejects.toBe('failed')
    expect(stop).toHaveBeenCalled()
    start.mockRestore()
    stop.mockRestore()
  })

  it('stopped by its limit, it is never longer than the limit, even when timers ran late (final review)', async () => {
    const real = Date.now.bind(Date)
    let late = 0
    const now = vi.spyOn(Date, 'now').mockImplementation(() => real() + late)
    const onLimit = vi.fn()
    const recorder = await startRecording('voice', { maxMs: 400, onLimit })
    late = 2000
    await vi.waitFor(() => expect(onLimit).toHaveBeenCalledOnce(), { timeout: 3000 })
    expect((await recorder.stop()).durationMs).toBeLessThanOrEqual(400)
    now.mockRestore()
  })
})
