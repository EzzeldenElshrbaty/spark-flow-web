import { IconPlayerPauseFilled, IconPlayerPlayFilled } from '@tabler/icons-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { Clip } from '@/api/types'
import { Icon } from '@/components/sf/Icon'
import { isRtl } from '@/components/sf/layers'
import { play, stopped } from '@/lib/clipPlayback'
import { formatClipLength } from '@/lib/format'

const STEP_S = 5

/**
 * A voice message's player (chat spec 6.9, the kit's `.sf-clip`): a round play button, the waveform, which is also the
 * position slider, and the time. The length comes from `clip.durationMs`, never from the media: a browser's WebM
 * recording may not carry one. One plays at a time across the page.
 */
export function VoicePlayer({ src, clip }: { src: string; clip: Clip }) {
  const id = useId()
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
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
    if (!element) return
    if (playing) element.pause()
    else {
      play(id, () => element.pause())
      void element.play().catch(() => setPlaying(false))
    }
  }
  const onKey = (event: KeyboardEvent) => {
    const to = { ArrowRight: position + STEP_S, ArrowUp: position + STEP_S, ArrowLeft: position - STEP_S, ArrowDown: position - STEP_S, Home: 0, End: total }[event.key]
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
    <div className="flex w-[380px] max-w-full items-center gap-3 rounded-sf-lg border border-sf-line bg-sf-surface px-3 py-2">
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
        className="sf-focus flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-0.5 overflow-hidden rounded-sf-sm"
      >
        {clip.waveform.map((value, i) => {
          const played = i < fraction * clip.waveform.length
          return (
            <i
              key={i}
              data-bar=""
              data-played={played ? '' : undefined}
              style={{ height: `max(2px, ${Math.round(value * 28)}px)` }}
              className={played ? 'block w-[3px] flex-none rounded-[2px] bg-sf-accent' : 'block w-[3px] flex-none rounded-[2px] bg-sf-line-strong'}
            />
          )
        })}
      </div>
      <span className="sf-meta flex-none text-sf-text-secondary tabular-nums">{formatClipLength(playing || position > 0 ? position * 1000 : clip.durationMs)}</span>
      <audio
        ref={audio}
        src={src}
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
  )
}
