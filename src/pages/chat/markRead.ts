/** Whether the open channel should be marked read again: its newest message changed while the tab is in view. */
export function shouldMarkRead(prevNewestId: string | null, newestId: string | null, visible: boolean): boolean {
  return visible && newestId !== null && newestId !== prevNewestId
}
