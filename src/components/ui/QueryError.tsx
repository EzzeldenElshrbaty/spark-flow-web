/** A load that failed, said in that pane, with a way to try again. A 404 is the caller's to show as NotFound. */
export function QueryError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <p role="alert" className="text-sm text-fg-muted">
      {what.charAt(0).toUpperCase() + what.slice(1)} didn't load.{' '}
      <button type="button" onClick={onRetry} className="font-medium text-accent hover:text-accent-strong">
        Try again
      </button>
    </p>
  )
}
