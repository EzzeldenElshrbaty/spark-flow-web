import { Fragment, useEffect, useReducer, useRef, useState } from 'react'
import type { Clip, ClipKind } from '@/api/types'
import { announce } from '@/components/sf/Announcer'
import { Button } from '@/components/sf/Button'
import { Modal, ModalCancelButton } from '@/components/sf/Modal'
import { clipMaxMs, clipName } from '@/lib/clips'
import { formatClipLength } from '@/lib/format'
import { recordErrorOf, startRecording, type Recorder, type RecordError, type Recording, type StartRecording } from '@/lib/recorder'
import { VoicePlayer } from './VoicePlayer'

const TICK_MS = 100
const METER_BARS = 24

type Step =
  | { step: 'asking' }
  | { step: 'recording'; recorder: Recorder }
  | { step: 'stopped'; recording: Recording; url: string; atLimit: boolean }
  | { step: 'error'; sentence: string }

const deviceOf = (kind: ClipKind) => (kind === 'voice' ? 'microphone' : 'camera')

function errorSentence(error: RecordError, kind: ClipKind) {
  const device = deviceOf(kind)
  if (error === 'denied') return `Flow can’t use your ${device}. Allow it in your browser’s site settings, then try again.`
  if (error === 'missing') return `No ${device} found.`
  if (error === 'busy') return `Your ${device} is in use by another app.`
  return 'Couldn’t record. Try again.'
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true

/**
 * Record a voice or video message (chat spec 6.9 §6): ask for the microphone or camera, record with the time and a
 * level meter (or the camera's picture), then check it and Re-record or Attach. Cancel asks first once something is
 * recorded. `start` is the recorder, a prop so tests hand in a fake.
 */
export function RecordDialog({ kind, start = startRecording, onAttach, onClose }: {
  kind: ClipKind
  start?: StartRecording
  onAttach: (file: File, clip: Clip) => void
  onClose: () => void
}) {
  const maxMs = clipMaxMs(kind)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<Step>({ step: 'asking' })
  const recorderRef = useRef<Recorder | null>(null)
  const finishRef = useRef<((atLimit: boolean) => Promise<void>) | null>(null)

  // Each attempt asks for the device and records; leaving it (Re-record, Try again, closing) switches it off.
  useEffect(() => {
    const controller = new AbortController()
    let live = true
    // One stop per attempt: a second Stop, or Stop racing the limit, reuses it (one preview URL) and keeps the limit's
    // note (final review).
    let stopping: Promise<Recording> | null = null
    let limitHit = false
    const finish = async (atLimit: boolean) => {
      if (atLimit) limitHit = true
      const recorder = recorderRef.current
      if (!recorder || !live) return
      const first = !stopping
      stopping ??= recorder.stop()
      const recording = await stopping
      if (!live) return
      if (!first) {
        if (limitHit) setState((s) => (s.step === 'stopped' ? { ...s, atLimit: true } : s))
        return
      }
      setState({ step: 'stopped', recording, url: URL.createObjectURL(recording.blob), atLimit: limitHit })
      announce(`Recording stopped, ${formatClipLength(recording.durationMs)}.`)
    }
    finishRef.current = finish
    start(kind, { maxMs, signal: controller.signal, onLimit: () => void finish(true), onEnded: () => void finish(false) }).then(
      (recorder) => {
        if (!live) return recorder.cancel()
        recorderRef.current = recorder
        setState({ step: 'recording', recorder })
        announce('Recording started.')
      },
      (error: unknown) => {
        if (!live) return
        const sentence = errorSentence(recordErrorOf(error), kind)
        setState({ step: 'error', sentence })
        announce(sentence)
      },
    )
    return () => {
      live = false
      controller.abort()
      recorderRef.current?.cancel()
      recorderRef.current = null
    }
  }, [attempt, kind, maxMs, start])

  // While it records: the time and the meter, a few times a second; nothing is read out per tick.
  const [, tick] = useReducer((n: number) => n + 1, 0)
  const [meter, setMeter] = useState<number[]>([])
  const recorder = state.step === 'recording' ? state.recorder : null
  useEffect(() => {
    if (!recorder) return
    const timer = setInterval(() => {
      tick()
      setMeter((levels) => [...levels.slice(-(METER_BARS - 1)), recorder.level()])
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [recorder])

  const url = state.step === 'stopped' ? state.url : null
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url])

  const again = () => {
    setState({ step: 'asking' })
    setMeter([])
    setAttempt((n) => n + 1)
  }
  const attach = () => {
    if (state.step !== 'stopped') return
    const { recording } = state
    onAttach(new File([recording.blob], clipName(kind, new Date(), recording.mimeType), { type: recording.mimeType }), {
      kind,
      durationMs: recording.durationMs,
      waveform: recording.waveform,
    })
    onClose()
  }

  const device = deviceOf(kind)
  const kindWord = kind === 'voice' ? 'voice' : 'video'
  let body
  let footer
  if (state.step === 'asking') {
    body = <p className="sf-ui text-sf-text-secondary">Waiting for your {device}…</p>
    // Focus stays in the dialog while the browser asks, after Re-record and Try again too (final review).
    footer = <ModalCancelButton touch autoFocus />
  } else if (state.step === 'recording') {
    body = (
      <div className="flex flex-col items-center gap-4">
        {kind === 'video' && (
          <video
            ref={(element) => {
              if (element && element.srcObject !== state.recorder.stream) element.srcObject = state.recorder.stream
            }}
            muted
            autoPlay
            playsInline
            aria-label="Your camera"
            className="aspect-video w-full max-w-[480px] -scale-x-100 rounded-sf-lg bg-sf-surface-sunken object-cover"
          />
        )}
        <p className="sf-ui-medium flex items-center gap-2 text-sf-text">
          <span aria-hidden className="size-2.5 rounded-sf-full bg-sf-accent-fill" />
          Recording
          <span className="sf-ui text-sf-text-secondary tabular-nums">
            {formatClipLength(state.recorder.elapsedMs())} / {formatClipLength(maxMs)}
          </span>
        </p>
        {kind === 'voice' && !reducedMotion() && (
          <div aria-hidden className="flex h-10 items-center gap-1">
            {Array.from({ length: METER_BARS }, (_, i) => meter[i - (METER_BARS - meter.length)] ?? 0).map((level, i) => (
              <i key={i} style={{ height: `max(4px, ${Math.round(level * 40)}px)` }} className="block w-1.5 rounded-sf-full bg-sf-accent" />
            ))}
          </div>
        )}
      </div>
    )
    footer = (
      <>
        <ModalCancelButton touch />
        <Button touch variant="primary" autoFocus onClick={() => void finishRef.current?.(false)}>
          Stop
        </Button>
      </>
    )
  } else if (state.step === 'stopped') {
    const { recording } = state
    body = (
      <div className="flex flex-col items-center gap-3">
        {kind === 'voice' ? (
          <VoicePlayer src={state.url} clip={{ kind, durationMs: recording.durationMs, waveform: recording.waveform }} />
        ) : (
          <video src={state.url} controls aria-label="Your recording" className="aspect-video w-full max-w-[480px] rounded-sf-lg bg-sf-surface-sunken" />
        )}
        {state.atLimit && (
          <p className="sf-small text-sf-text-secondary">
            Stopped at {formatClipLength(maxMs)}, the longest a {kindWord} message can be.
          </p>
        )}
      </div>
    )
    footer = (
      <>
        <ModalCancelButton touch />
        <Button touch onClick={again}>
          Re-record
        </Button>
        <Button touch variant="primary" autoFocus onClick={attach}>
          Attach
        </Button>
      </>
    )
  } else {
    body = <p className="sf-ui text-sf-error">{state.sentence}</p>
    footer = (
      <>
        <ModalCancelButton touch />
        <Button touch variant="primary" autoFocus onClick={again}>
          Try again
        </Button>
      </>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={kind === 'voice' ? 'Record a voice message' : 'Record a video message'}
      dirty={state.step === 'recording' || state.step === 'stopped'}
      discardQuestion="Discard the recording?"
      keepLabel={state.step === 'recording' ? 'Keep recording' : 'Keep the recording'}
      // A new footer per state and attempt: its focused button mounts, so autoFocus puts focus on it.
      footer={<Fragment key={`${state.step}-${attempt}`}>{footer}</Fragment>}
    >
      {body}
    </Modal>
  )
}
