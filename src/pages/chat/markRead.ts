/**
 * Whether the open channel should be marked read again: its newest message changed while the tab is in view, and the
 * messages aren't being fetched (`settled`): cached ones shown while newer ones load mustn't mark those read unseen.
 */
export function shouldMarkRead(prevNewestId: string | null, newestId: string | null, visible: boolean, settled = true): boolean {
  return visible && settled && newestId !== null && newestId !== prevNewestId
}
