/**
 * Whether a touch 21px above, below, left and right of `el`'s centre lands on it: a 44 × 44 touch area
 * (UX Phase 5B, 5.4). `[up, down, left, right]`.
 */
export function answersTouch(el: Element): boolean[] {
  const r = el.getBoundingClientRect()
  const x = r.left + r.width / 2
  const y = r.top + r.height / 2
  return [
    [x, y - 21],
    [x, y + 21],
    [x - 21, y],
    [x + 21, y],
  ].map(([px, py]) => el.contains(document.elementFromPoint(px!, py!)))
}
