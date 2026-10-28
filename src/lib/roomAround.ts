/** Room above and below `el` inside everything that clips it: the window and every ancestor that scrolls or clips. */
export function roomAround(el: HTMLElement) {
  const { top, bottom } = el.getBoundingClientRect()
  let start = 0
  let end = window.innerHeight
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    if (getComputedStyle(node).overflowY === 'visible') continue
    const box = node.getBoundingClientRect()
    start = Math.max(start, box.top)
    end = Math.min(end, box.bottom)
  }
  return { above: top - start, below: end - bottom }
}
