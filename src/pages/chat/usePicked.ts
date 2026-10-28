import { useState } from 'react'

/** A failure as the sentence shown near its cause. */
export const errorText = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.')

/**
 * A saved setting as it shows while a change to it saves (Who can post, the default channel): the picked value, until
 * the saved one changes (to it, or to anything else); `unpick` puts the saved one back after a refusal.
 */
export function usePicked<T>(saved: T): [shown: T, pick: (value: T) => void, unpick: () => void] {
  const [choice, setChoice] = useState<{ value: T; from: T } | null>(null)
  const current = choice !== null && Object.is(saved, choice.from)
  if (choice && !current) setChoice(null)
  return [current ? choice.value : saved, (value) => setChoice({ value, from: saved }), () => setChoice(null)]
}
