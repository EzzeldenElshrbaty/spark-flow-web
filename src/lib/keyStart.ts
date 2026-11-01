/**
 * Whether a dialog was open when the key being handled went down. With a real key press the browser runs React's
 * pending work between listeners, so a dialog that closes on the key is gone by the time a listener on `window`
 * asks; this looks first, while capturing. `stop` ends the watch.
 */
export function watchDialogAtKeyDown(): { open: () => boolean; stop: () => void } {
  let open = false
  const onKeyDownCapture = () => {
    open = document.querySelector('[aria-modal="true"]') !== null
  }
  window.addEventListener('keydown', onKeyDownCapture, true)
  return { open: () => open, stop: () => window.removeEventListener('keydown', onKeyDownCapture, true) }
}
