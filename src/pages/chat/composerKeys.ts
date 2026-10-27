/**
 * Whether Enter sends the message. With a mouse it does (Shift+Enter makes a new line); on a touch screen Enter makes
 * a new line and the Send button sends, since there's no Shift to reach for.
 */
export function shouldSendOnEnter(e: { key: string; shiftKey: boolean; isComposing: boolean }, coarse: boolean): boolean {
  return e.key === 'Enter' && !e.shiftKey && !e.isComposing && !coarse
}

/** Whether the main pointer is a finger (a phone or tablet). */
export const coarsePointer = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
