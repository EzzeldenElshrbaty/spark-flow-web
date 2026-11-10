/**
 * Puts focus on the page's own heading (the `h1` inside `main`), for when the place focus should go back to is gone
 * (UX Phase 5A, 5.5) and after a move to another page (5.7). Returns it, or null while the page has none yet.
 */
export function focusPageHeading(): HTMLElement | null {
  const heading = document.querySelector<HTMLElement>('main h1')
  if (!heading) return null
  if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1
  heading.focus({ preventScroll: true })
  return heading
}
