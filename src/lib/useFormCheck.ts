import { useState } from 'react'

/**
 * A form's own errors, shown the kit's way (UX Phase 4, 4.4): nothing before the first Save; from then on the rules'
 * answer on every render, so an error leaves as soon as its field is fixed and comes back if it breaks again.
 * `errorsNow` is the rules' answer for the values as they are; a key without a message is fine. Server refusals stay
 * the form's own state.
 */
export function useFormCheck<E extends Record<string, string | undefined>>(errorsNow: E) {
  const [tried, setTried] = useState(false)
  const errors: Partial<E> = tried ? errorsNow : {}
  /** Marks the form tried; true when nothing is wrong, so the form may save. */
  const attempt = () => {
    setTried(true)
    return Object.values(errorsNow).every((message) => !message)
  }
  const reset = () => setTried(false)
  return { errors, attempt, reset }
}
