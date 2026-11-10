import { useEffect, useRef, useState } from 'react'

/** Puts the caret on a form's first error: the first field marked invalid, or else the first control of a group marked
 * `data-invalid` (a fieldset of checkboxes). */
export function focusFirstError(form: HTMLElement | null) {
  const field = form?.querySelector<HTMLElement>('[aria-invalid="true"]')
  const inGroup = form?.querySelector<HTMLElement>('[data-invalid] :is(input, select, textarea, button):not(:disabled)')
  ;(field ?? inGroup)?.focus()
}

/**
 * A form's own errors, shown the kit's way (UX Phase 4, 4.4): nothing before the first Save; from then on the rules'
 * answer on every render, so an error leaves as soon as its field is fixed and comes back if it breaks again.
 * `errorsNow` is the rules' answer for the values as they are; a key without a message is fine. Server refusals stay
 * the form's own state.
 * A Save that finds errors puts the caret on the first one, once they show: give the form `formRef` (UX Phase 5A, 5.9).
 */
export function useFormCheck<E extends Record<string, string | undefined>>(errorsNow: E) {
  const [tried, setTried] = useState(false)
  const errors: Partial<E> = tried ? errorsNow : {}
  const formRef = useRef<HTMLFormElement | null>(null)
  // Counts failed Saves, so each one moves the caret (after the errors it found have rendered).
  const [failed, setFailed] = useState(0)
  useEffect(() => {
    if (failed) focusFirstError(formRef.current)
  }, [failed])
  /** Marks the form tried; true when nothing is wrong, so the form may save. */
  const attempt = () => {
    setTried(true)
    const ok = Object.values(errorsNow).every((message) => !message)
    if (!ok) setFailed((n) => n + 1)
    return ok
  }
  const reset = () => setTried(false)
  return { errors, attempt, reset, formRef }
}
