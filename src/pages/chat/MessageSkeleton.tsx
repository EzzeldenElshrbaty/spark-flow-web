/** Pulse rows standing in for messages while they load. */
export function MessageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="h-16 animate-pulse rounded-lg bg-surface-muted" />
      ))}
    </div>
  )
}
