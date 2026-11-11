/**
 * One recording plays at a time (chat spec 6.9): starting one pauses the one before. A module-level "now playing",
 * since players sit in separate messages with nothing above them to share state.
 */
let now: { id: string; pause: () => void } | null = null

/** Player `id` starts; `pause` stops it when another starts. */
export function play(id: string, pause: () => void) {
  if (now && now.id !== id) now.pause()
  now = { id, pause }
}

/** Player `id` stopped by itself (paused, ended, gone). */
export function stopped(id: string) {
  if (now?.id === id) now = null
}
