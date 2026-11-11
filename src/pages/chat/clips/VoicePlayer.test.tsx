// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Clip } from '@/api/types'
import { VoicePlayer } from './VoicePlayer'

const clip: Clip = { kind: 'voice', durationMs: 42_000, waveform: Array.from({ length: 48 }, (_, i) => (i % 5) / 4) }
let playing: HTMLMediaElement[]

beforeEach(() => {
  playing = []
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    playing.push(this)
    this.dispatchEvent(new Event('play'))
    return Promise.resolve()
  })
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('pause'))
  })
  // WebM from MediaRecorder has no length until it has played through: the player must not ask the media.
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get: () => Infinity })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const slider = () => screen.getByRole('slider', { name: 'Position' })

describe('VoicePlayer (chat spec 6.9 sf-clip)', () => {
  it('plays and pauses, and says which it will do', () => {
    render(<VoicePlayer src="blob:voice" clip={clip} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play voice message' }))
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Pause voice message' }))
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Play voice message' })).toBeTruthy()
  })

  it('takes its length from the clip, not the media', () => {
    render(<VoicePlayer src="blob:voice" clip={clip} />)
    expect(screen.getByText('0:42')).toBeTruthy()
    expect(slider().getAttribute('aria-valuemax')).toBe('42')
    expect(slider().getAttribute('aria-valuetext')).toBe('0:00 of 0:42')
  })

  it('the waveform is a slider: arrows move 5 s, Home and End go to the ends', () => {
    const { container } = render(<VoicePlayer src="blob:voice" clip={clip} />)
    const audio = container.querySelector('audio')!
    fireEvent.keyDown(slider(), { key: 'ArrowRight' })
    expect(audio.currentTime).toBe(5)
    expect(slider().getAttribute('aria-valuetext')).toBe('0:05 of 0:42')
    fireEvent.keyDown(slider(), { key: 'End' })
    expect(audio.currentTime).toBe(42)
    fireEvent.keyDown(slider(), { key: 'Home' })
    expect(audio.currentTime).toBe(0)
    fireEvent.keyDown(slider(), { key: 'ArrowLeft' })
    expect(audio.currentTime).toBe(0)
  })

  it('draws 48 bars, coloured up to where it has played', () => {
    const { container } = render(<VoicePlayer src="blob:voice" clip={clip} />)
    const audio = container.querySelector('audio')!
    act(() => {
      audio.currentTime = 21
      audio.dispatchEvent(new Event('timeupdate'))
    })
    const bars = [...container.querySelectorAll('[data-bar]')]
    expect(bars).toHaveLength(48)
    expect(bars.filter((b) => b.hasAttribute('data-played'))).toHaveLength(24)
    expect(bars.slice(0, 24).every((b) => b.hasAttribute('data-played'))).toBe(true)
  })

  it('starting one pauses the other', () => {
    render(
      <>
        <VoicePlayer src="blob:one" clip={clip} />
        <VoicePlayer src="blob:two" clip={clip} />
      </>,
    )
    const [first, second] = screen.getAllByRole('button', { name: 'Play voice message' })
    fireEvent.click(first!)
    fireEvent.click(second!)
    expect(screen.getAllByRole('button', { name: 'Play voice message' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Pause voice message' })).toHaveLength(1)
  })

  it('a click on the waveform seeks to that point (final review)', () => {
    const { container } = render(<VoicePlayer src="blob:voice" clip={clip} />)
    vi.spyOn(slider(), 'getBoundingClientRect').mockReturnValue({ left: 100, right: 300, width: 200, top: 0, bottom: 28, height: 28, x: 100, y: 0, toJSON: () => ({}) })
    fireEvent.pointerDown(slider(), { clientX: 200 })
    expect(container.querySelector('audio')!.currentTime).toBe(21)
  })

  it('right to left, ArrowLeft moves forward (final review)', () => {
    const { container } = render(
      <div dir="rtl" style={{ direction: 'rtl' }}>
        <VoicePlayer src="blob:voice" clip={clip} />
      </div>,
    )
    fireEvent.keyDown(slider(), { key: 'ArrowLeft' })
    expect(container.querySelector('audio')!.currentTime).toBe(5)
    fireEvent.keyDown(slider(), { key: 'ArrowRight' })
    expect(container.querySelector('audio')!.currentTime).toBe(0)
  })

  it('a recording that won’t play says so, and lets another play (final review)', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new DOMException('no', 'NotSupportedError'))
    render(<VoicePlayer src="blob:voice" clip={clip} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play voice message' }))
    expect(await screen.findByText('Couldn’t play this voice message.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Play voice message' })).toBeTruthy()
  })
})
