/**
 * Whether the open channel should be marked read again: its newest message changed while the tab is in view, and the
 * messages aren't being fetched (`settled`): cached ones shown while newer ones load mustn't mark those read unseen.
 */
export function shouldMarkRead(prevNewestId: string | null, newestId: string | null, visible: boolean, settled = true): boolean {
  return visible && settled && newestId !== null && newestId !== prevNewestId
}

/**
 * How far the channel list should mark read (spec 6.2): up to its newest message once that message is on screen
 * (`atBottom`), the tab is visible, the window focused and nothing is being fetched; null when nothing changes.
 */
export function readUpTo(s: { atBottom: boolean; visible: boolean; focused: boolean; settled: boolean; newestSeq: number | null; markedSeq: number }): number | null {
  if (!s.atBottom || !s.visible || !s.focused || !s.settled || s.newestSeq === null) return null
  return s.newestSeq > s.markedSeq ? s.newestSeq : null
}
