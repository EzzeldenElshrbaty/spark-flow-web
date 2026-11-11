import { IconPlayerPauseFilled, IconPlayerPlayFilled } from '@tabler/icons-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { Clip } from '@/api/types'
import { announce } from '@/components/sf/Announcer'
import { Icon } from '@/components/sf/Icon'
import { isRtl } from '@/components/sf/layers'
import { play, stopped } from '@/lib/clipPlayback'
import { formatClipLength } from '@/lib/format'

const STEP_S = 5
const PLAY_FAILED = 'Couldn’t play this voice message.'

/**
 * A voice message's player (chat spec 6.9, the kit's `.sf-clip`): a round play button, the waveform, which is also the
 * position slider, and the time. The length comes from `clip.durationMs`, never from the media: a browser's WebM
 * recording may not carry one. One plays at a time across the page.
 */
export function VoicePlayer({ src, clip }: { src: string | null; clip: Clip }) {
  const id = useId()
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [failed, setFailed] = useState(false)
  const total = clip.durationMs / 1000
  const fraction = total > 0 ? Math.min(1, position / total) : 0

  useEffect(() => {
    const element = audio.current
    return () => {
      element?.pause()
      stopped(id)
    }
  }, [id])

  const seek = (seconds: number) => {
    const to = Math.min(total, Math.max(0, seconds))
    if (audio.current) audio.current.currentTime = to
    setPosition(to)
  }
  const toggle = () => {
    const element = audio.current
    // Before the file's address has arrived there is nothing to play yet.
    if (!element || !src) return
    if (playing) element.pause()
    else {
      setFailed(false)
      play(id, () => element.pause())
      // A recording the browser won't play says so beside the player, and lets another play (final review).
      void element.play().catch(() => {
        setPlaying(false)
        setFailed(true)
        stopped(id)
        announce(PLAY_FAILED)
      })
    }
  }
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    // Right to left the waveform runs from the right, so ArrowLeft moves forward (final review).
    const [forward, back] = isRtl(event.currentTarget) ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft']
    const to = {
      [forward]: position + STEP_S,
      ArrowUp: position + STEP_S,
      [back]: position - STEP_S,
      ArrowDown: position - STEP_S,
      Home: 0,
      End: total,
    }[event.key]
    if (to === undefined) return
    event.preventDefault()
    seek(to)
  }
  const onPointer = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    if (box.width === 0) return
    const along = isRtl(event.currentTarget) ? box.right - event.clientX : event.clientX - box.left
    seek((along / box.width) * total)
  }

  return (
    <div className="flex w-[380px] max-w-full flex-col gap-1">
      <div className="flex w-full items-center gap-3 rounded-sf-lg border border-sf-line bg-sf-surface px-3 py-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Pause voice message' : 'Play voice message'}
          title={playing ? 'Pause voice message' : 'Play voice message'}
          className="sf-focus grid size-8 flex-none cursor-pointer place-items-center rounded-sf-full border-0 bg-sf-accent-fill text-sf-on-accent max-md:touch-target"
        >
          <Icon icon={playing ? IconPlayerPauseFilled : IconPlayerPlayFilled} size={16} />
        </button>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Position"
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(position)}
          aria-valuetext={`${formatClipLength(position * 1000)} of ${formatClipLength(clip.durationMs)}`}
          onKeyDown={onKey}
          onPointerDown={onPointer}
          // The bars spread over the slider's whole width, so a click seeks where the bar is (final review); on phones the
          // slider is 44 px tall itself.
          className="sf-focus flex h-7 min-w-0 flex-1 cursor-pointer items-center justify-between rounded-sf-sm max-md:h-11"
        >
          {clip.waveform.map((value, i, bars) => {
            const played = fraction >= 1 || i / Math.max(1, bars.length - 1) < fraction
            return (
              <i
                key={i}
                data-bar=""
                data-played={played ? '' : undefined}
                style={{ height: `max(2px, ${Math.round(value * 28)}px)` }}
                className={played ? 'block w-[3px] min-w-px shrink rounded-[2px] bg-sf-accent' : 'block w-[3px] min-w-px shrink rounded-[2px] bg-sf-line-strong'}
              />
            )
          })}
        </div>
        <span className="sf-meta flex-none text-sf-text-secondary tabular-nums">{formatClipLength(playing || position > 0 ? position * 1000 : clip.durationMs)}</span>
        <audio
          ref={audio}
          src={src ?? undefined}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => {
            setPlaying(false)
            stopped(id)
          }}
          onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
          onEnded={() => {
            setPlaying(false)
            seek(0)
            stopped(id)
          }}
        />
      </div>
      {failed && <p className="sf-small m-0 text-sf-error">{PLAY_FAILED}</p>}
    </div>
  )
}
