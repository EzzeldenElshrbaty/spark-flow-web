/**
 * What a screen reader hears about the room left in a message: a few steps, each read once, instead of the count on
 * every key (UX Phase 5A, 5.12). The count itself shows from fewer than 1,000 left.
 */
export function countNotice(remaining: number): string {
  if (remaining >= 1000) return ''
  if (remaining >= 500) return 'Fewer than 1,000 characters left.'
  if (remaining >= 100) return 'Fewer than 500 characters left.'
  if (remaining > 0) return 'Fewer than 100 characters left.'
  if (remaining === 0) return 'No characters left.'
  return 'Too long to send. Remove some text.'
}
