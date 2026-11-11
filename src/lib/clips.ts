import type { Clip, ClipKind } from '@/api/types'
import { formatClipLength, formatDate } from '@/lib/format'

/** How long a recording may run (chat spec 6.9): voice 5 minutes, video 2. */
export const VOICE_MAX_MS = 300_000
export const VIDEO_MAX_MS = 120_000
/** A voice message's waveform: this many bar heights, each 0–1. */
export const WAVE_BARS = 48

export const clipMaxMs = (kind: ClipKind) => (kind === 'voice' ? VOICE_MAX_MS : VIDEO_MAX_MS)

const kindName = (kind: ClipKind) => (kind === 'voice' ? 'Voice message' : 'Video message')
const EXTENSIONS: Record<string, string> = { 'audio/webm': '.webm', 'audio/mp4': '.m4a', 'audio/ogg': '.ogg', 'video/webm': '.webm', 'video/mp4': '.mp4' }

/** A recording's file name: "Voice message 11 Nov 2026 2.32 PM.webm" (no ":", which a file name can't hold everywhere). */
export function clipName(kind: ClipKind, at: Date, mimeType: string): string {
  const hours = at.getHours() % 12 || 12
  const time = `${hours}.${String(at.getMinutes()).padStart(2, '0')} ${at.getHours() < 12 ? 'AM' : 'PM'}`
  const extension = EXTENSIONS[mimeType.split(';')[0]!.trim()] ?? (kind === 'voice' ? '.webm' : '.mp4')
  return `${kindName(kind)} ${formatDate(at.toISOString())} ${time}${extension}`
}

/** "Voice message · 0:42": the tray's subline and a video message's type label. */
export const clipLabel = (clip: Clip) => `${kindName(clip.kind)} · ${formatClipLength(clip.durationMs)}`

/** A recording's title on the file: "Voice message" or "Video message". */
export const clipTitle = (kind: ClipKind) => kindName(kind)
