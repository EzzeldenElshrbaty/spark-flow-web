/**
 * "Skip to content": the shell's first Tab stop, past the sidebar and top bar to the page (`<main id="main">`). It shows
 * only while focused, and moves focus without changing the address (UX Phase 5A, 5.7).
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      onClick={(event) => {
        event.preventDefault()
        document.getElementById('main')?.focus()
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-fg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      Skip to content
    </a>
  )
}
