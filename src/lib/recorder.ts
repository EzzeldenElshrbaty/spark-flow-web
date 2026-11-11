import type { ClipKind } from '@/api/types'
import { WAVE_BARS } from '@/lib/clips'

/**
 * Recording a voice or video message in the browser (chat spec 6.9). The only module that touches `getUserMedia`,
 * `MediaRecorder` and Web Audio: the record dialog takes `startRecording` as a prop, so tests hand it a fake.
 */

/** What a finished recording hands over: its bytes, their type (no codecs), its length and, for voice, its waveform. */
export type Recording = { blob: Blob; mimeType: string; durationMs: number; waveform: number[] }
/** Why a recording couldn't start: permission refused, no such device, the device in use, anything else. */
export type RecordError = 'denied' | 'missing' | 'busy' | 'failed'
export type Recorder = {
  /** For the camera's picture while a video records. */
  stream: MediaStream
  /** How loud it is now, 0–1 (the level meter). */
  level(): number
  elapsedMs(): number
  /** Stops and hands over the recording; the microphone and camera go off. */
  stop(): Promise<Recording>
  /** Stops and keeps nothing; the microphone and camera go off. */
  cancel(): void
}
export type StartRecording = typeof startRecording

const FORMATS: Record<ClipKind, string[]> = {
  voice: ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'],
  video: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/mp4'],
}
const VIDEO: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
const LEVEL_EVERY_MS = 50

/** The first format the browser records, in the spec's order; null when it records none. */
export function pickMimeType(kind: ClipKind, isTypeSupported: (type: string) => boolean): string | null {
  return FORMATS[kind].find((type) => isTypeSupported(type)) ?? null
}

/** Whether this browser can record this kind at all (no buttons otherwise). */
export function canRecord(kind: ClipKind): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getUserMedia !== 'function' || typeof MediaRecorder === 'undefined') return false
  return pickMimeType(kind, (type) => MediaRecorder.isTypeSupported(type)) !== null
}

/**
 * A voice message's waveform: `bars` heights, each the loudest level of its share of the recording, scaled so the
 * loudest bar is 1, with two decimals. Silence, or nothing at all, is every bar at 0.
 */
export function waveformOf(levels: number[], bars = WAVE_BARS): number[] {
  if (levels.length === 0) return Array<number>(bars).fill(0)
  const peaks = Array.from({ length: bars }, (_, i) => {
    const from = Math.floor((i * levels.length) / bars)
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / bars))
    return Math.max(...levels.slice(from, to))
  })
  const loudest = Math.max(...peaks)
  return peaks.map((peak) => (loudest > 0 ? Math.round((peak / loudest) * 100) / 100 : 0))
}

const RECORD_ERRORS: readonly RecordError[] = ['denied', 'missing', 'busy', 'failed']

/** Why `getUserMedia` (or anything after it) failed, as the dialog says it. */
export function recordErrorOf(error: unknown): RecordError {
  if (typeof error === 'string' && (RECORD_ERRORS as readonly string[]).includes(error)) return error as RecordError
  const name = error instanceof DOMException || error instanceof Error ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'missing'
  if (name === 'NotReadableError') return 'busy'
  return 'failed'
}

/**
 * Starts recording `kind`. It stops by itself at `maxMs` (then `onLimit`) or when a device goes away (then `onEnded`),
 * keeping what was recorded. A `signal` aborted while the browser was still asking switches off the stream it then
 * gives (chat spec 6.9, final review focus). Rejects with a `RecordError`.
 */
export async function startRecording(kind: ClipKind, opts: { maxMs: number; onLimit: () => void; onEnded?: () => void; signal?: AbortSignal }): Promise<Recorder> {
  const picked = canRecord(kind) ? pickMimeType(kind, (type) => MediaRecorder.isTypeSupported(type)) : null
  if (!picked) throw 'failed' satisfies RecordError
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia(kind === 'voice' ? { audio: true } : { audio: true, video: VIDEO })
  } catch (error) {
    throw recordErrorOf(error)
  }
  const tracksOff = () => stream.getTracks().forEach((track) => track.stop())
  if (opts.signal?.aborted) {
    tracksOff()
    throw 'failed' satisfies RecordError
  }

  let recorder: MediaRecorder
  try {
    recorder = new MediaRecorder(stream, kind === 'voice' ? { mimeType: picked, audioBitsPerSecond: 32_000 } : { mimeType: picked, videoBitsPerSecond: 1_200_000, audioBitsPerSecond: 64_000 })
  } catch (error) {
    tracksOff()
    throw recordErrorOf(error)
  }
  const chunks: Blob[] = []
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  })

  // How loud: the RMS of the latest samples every 50 ms, kept for a voice message's waveform.
  let context: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  try {
    context = new AudioContext()
    analyser = context.createAnalyser()
    analyser.fftSize = 1024
    context.createMediaStreamSource(stream).connect(analyser)
  } catch {
    context = null
    analyser = null
  }
  const samples = new Float32Array(analyser?.fftSize ?? 0)
  const levels: number[] = []
  let current = 0
  const sampler = setInterval(() => {
    if (!analyser) return
    analyser.getFloatTimeDomainData(samples)
    let sum = 0
    for (const value of samples) sum += value * value
    current = Math.min(1, Math.sqrt(sum / samples.length) * 4)
    if (kind === 'voice') levels.push(current)
  }, LEVEL_EVERY_MS)

  const started = Date.now()
  let endedAt: number | null = null
  let finished: Promise<Recording> | null = null
  let cancelled = false
  const release = () => {
    clearInterval(sampler)
    clearTimeout(limit)
    tracksOff()
    void context?.close().catch(() => {})
  }
  const finish = (): Promise<Recording> => {
    if (finished) return finished
    endedAt = Date.now()
    const durationMs = Math.max(1, endedAt - started)
    const mimeType = (recorder.mimeType || picked).split(';')[0]!.trim()
    finished = new Promise<Recording>((resolve) => {
      const done = () => {
        release()
        resolve({ blob: new Blob(chunks, { type: mimeType }), mimeType, durationMs, waveform: kind === 'voice' ? waveformOf(levels) : [] })
      }
      if (recorder.state === 'inactive') done()
      else {
        recorder.addEventListener('stop', done, { once: true })
        recorder.stop()
      }
    })
    return finished
  }
  const limit = setTimeout(() => {
    if (!cancelled) void finish().then(() => opts.onLimit())
  }, opts.maxMs)
  // A device unplugged, or its permission taken back: stop as if Stop was pressed, keeping what was recorded.
  for (const track of stream.getTracks())
    track.addEventListener('ended', () => {
      if (!cancelled && !finished) void finish().then(() => opts.onEnded?.())
    })

  recorder.start(250)
  return {
    stream,
    level: () => current,
    elapsedMs: () => (endedAt ?? Date.now()) - started,
    stop: finish,
    cancel() {
      if (cancelled) return
      cancelled = true
      if (recorder.state !== 'inactive') recorder.stop()
      release()
    },
  }
}
