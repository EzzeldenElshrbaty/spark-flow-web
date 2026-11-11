// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Clip, ClipKind } from '@/api/types'
import { announce, Announcer } from '@/components/sf/Announcer'
import type { Recorder, RecordError, Recording, StartRecording } from '@/lib/recorder'
import { RecordDialog } from './RecordDialog'

window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const bars = Array.from({ length: 48 }, (_, i) => (i % 4) / 4)
let onAttach: (file: File, clip: Clip) => void
let onClose: () => void

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 10, 11, 14, 32), shouldAdvanceTime: false })
  announce('')
  onAttach = vi.fn()
  onClose = vi.fn()
  URL.createObjectURL = vi.fn(() => 'blob:recording')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** A recorder the test drives: started now, 42 s long when it stops. */
function fake(kind: ClipKind = 'voice') {
  const t0 = Date.now()
  let opts: Parameters<StartRecording>[1] | undefined
  const recording: Recording = { blob: new Blob(['x'], { type: kind === 'voice' ? 'audio/webm' : 'video/webm' }), mimeType: kind === 'voice' ? 'audio/webm' : 'video/webm', durationMs: 42_000, waveform: kind === 'voice' ? bars : [] }
  const recorders: Recorder[] = []
  let refuse: RecordError | null = null
  let hold: Promise<void> | null = null
  const start = vi.fn(async (_kind: ClipKind, o: Parameters<StartRecording>[1]) => {
    opts = o
    if (hold) await hold
    if (refuse) throw refuse
    const recorder: Recorder = { stream: {} as MediaStream, level: () => 0.5, elapsedMs: () => Date.now() - t0, stop: vi.fn(async () => recording), cancel: vi.fn() }
    recorders.push(recorder)
    return recorder
  }) as unknown as StartRecording & ReturnType<typeof vi.fn>
  return {
    start,
    recorders,
    opts: () => opts!,
    refuseWith: (e: RecordError | null) => (refuse = e),
    holdUntil: (p: Promise<void>) => (hold = p),
  }
}

function mount(kind: ClipKind, start: StartRecording) {
  render(
    <>
      <Announcer />
      <RecordDialog kind={kind} start={start} onAttach={onAttach} onClose={onClose} />
    </>,
  )
}
const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)))
const status = () => screen.getAllByRole('status').map((s) => s.textContent).join(' | ')

describe('RecordDialog (chat spec 6.9)', () => {
  it('asks for the microphone, then records with the time and Stop focused', async () => {
    const f = fake()
    f.holdUntil(new Promise(() => {}))
    mount('voice', f.start)
    expect(screen.getByRole('dialog', { name: 'Record a voice message' })).toBeTruthy()
    expect(screen.getByText('Waiting for your microphone…')).toBeTruthy()
    cleanup()
    const g = fake()
    mount('voice', g.start)
    await settle()
    expect(screen.getByText('Recording')).toBeTruthy()
    expect(screen.getByText('0:00 / 5:00')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Stop' }))
    expect(status()).toContain('Recording started.')
    await act(async () => void (await vi.advanceTimersByTimeAsync(42_000)))
    expect(screen.getByText('0:42 / 5:00')).toBeTruthy()
  })

  it('a video message asks for the camera, shows it while it records, and may run 2 minutes', async () => {
    const f = fake('video')
    mount('video', f.start)
    expect(screen.getByRole('dialog', { name: 'Record a video message' })).toBeTruthy()
    expect(screen.getByText('Waiting for your camera…')).toBeTruthy()
    await settle()
    expect(screen.getByText('0:00 / 2:00')).toBeTruthy()
    const video = document.querySelector('video')!
    expect(video.muted).toBe(true)
    expect((video as HTMLVideoElement & { srcObject: unknown }).srcObject).toBe(f.recorders[0]!.stream)
  })

  it('Stop shows the recording to check, with Re-record and Attach', async () => {
    const f = fake()
    mount('voice', f.start)
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await settle()
    expect(status()).toContain('Recording stopped, 0:42.')
    expect(screen.getByRole('button', { name: 'Play voice message' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Re-record' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Attach' })).toBeTruthy()
  })

  it('Attach hands over the file and its clip, then closes', async () => {
    const f = fake()
    mount('voice', f.start)
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Attach' }))
    const [file, clip] = vi.mocked(onAttach).mock.calls[0]!
    expect(file.name).toBe('Voice message 11 Nov 2026 2.32 PM.webm')
    expect(file.type).toBe('audio/webm')
    expect(clip).toEqual({ kind: 'voice', durationMs: 42_000, waveform: bars })
    expect(onClose).toHaveBeenCalled()
  })

  it('Re-record throws the recording away and starts again, without asking', async () => {
    const f = fake()
    mount('voice', f.start)
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Re-record' }))
    await settle()
    expect(f.recorders[0]!.cancel).toHaveBeenCalled()
    expect(f.start).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Discard the recording?')).toBeNull()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
  })

  it('at the limit it stops by itself and says so', async () => {
    for (const [kind, words] of [
      ['voice', 'Stopped at 5:00, the longest a voice message can be.'],
      ['video', 'Stopped at 2:00, the longest a video message can be.'],
    ] as const) {
      const f = fake(kind)
      mount(kind, f.start)
      await settle()
      await act(async () => f.opts().onLimit())
      await settle()
      expect(screen.getByText(words)).toBeTruthy()
      cleanup()
    }
  })

  it('each reason it can’t record is a sentence, read out, with Try again', async () => {
    const sentences: [ClipKind, RecordError, string][] = [
      ['voice', 'denied', 'Flow can’t use your microphone. Allow it in your browser’s site settings, then try again.'],
      ['video', 'denied', 'Flow can’t use your camera. Allow it in your browser’s site settings, then try again.'],
      ['voice', 'missing', 'No microphone found.'],
      ['video', 'missing', 'No camera found.'],
      ['voice', 'busy', 'Your microphone is in use by another app.'],
      ['video', 'busy', 'Your camera is in use by another app.'],
      ['voice', 'failed', 'Couldn’t record. Try again.'],
    ]
    for (const [kind, error, words] of sentences) {
      announce('')
      const f = fake(kind)
      f.refuseWith(error)
      mount(kind, f.start)
      await settle()
      expect(within(screen.getByRole('dialog')).getByText(words), words).toBeTruthy()
      expect(status()).toContain(words)
      f.refuseWith(null)
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      await settle()
      expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
      cleanup()
    }
  })

  it('Cancel asks only once something is recorded, naming what Keep keeps', async () => {
    const f = fake()
    f.holdUntil(new Promise(() => {}))
    mount('voice', f.start)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
    cleanup()

    const g = fake()
    mount('voice', g.start)
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Discard the recording?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep recording' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Keep the recording' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('closing while the browser still asks aborts the start; closing while recording cancels it', async () => {
    const f = fake()
    f.holdUntil(new Promise(() => {}))
    mount('voice', f.start)
    cleanup()
    expect(f.opts().signal?.aborted).toBe(true)

    const g = fake()
    mount('voice', g.start)
    await settle()
    cleanup()
    expect(g.recorders[0]!.cancel).toHaveBeenCalled()
  })

  it('Stop pressed twice makes one recording to check (final review)', async () => {
    const f = fake()
    mount('voice', f.start)
    await settle()
    const stop = screen.getByRole('button', { name: 'Stop' })
    fireEvent.click(stop)
    fireEvent.click(stop)
    await settle()
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
  })

  it('Stop and the limit at the same moment keep the limit’s note (final review)', async () => {
    const f = fake()
    mount('voice', f.start)
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await act(async () => f.opts().onLimit())
    await settle()
    expect(screen.getByText('Stopped at 5:00, the longest a voice message can be.')).toBeTruthy()
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
  })

  it('while it asks for the device, focus stays in the dialog on Cancel, after Re-record too (final review)', async () => {
    const f = fake()
    mount('voice', f.start)
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    await settle()
    f.holdUntil(new Promise(() => {}))
    fireEvent.click(screen.getByRole('button', { name: 'Re-record' }))
    await settle()
    expect(screen.getByText('Waiting for your microphone…')).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
  })
})
