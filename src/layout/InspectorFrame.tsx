import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export type InspectorBodyProps = {
  /** Removes the inspector's param and keeps the rest of the URL. */
  onClose: () => void
  /** The same place as a link (for NotFound's way back). */
  closeTo: string
}

/**
 * The inspector's frame, after the Spark CRM page help panel: beside the content on wide screens (xl), sliding over
 * from the end side on tablets and laptops (no dimming), a bottom sheet on phones. The body scrolls on its own.
 */
export function InspectorFrame({ label, eyebrow, title, onClose, children }: { label: string; eyebrow: ReactNode; title: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <aside
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-40 flex h-[85vh] flex-col rounded-t-2xl border-t border-line bg-surface shadow-2xl motion-safe:animate-fade-up sm:inset-x-auto sm:end-0 sm:top-0 sm:h-full sm:w-[24rem] sm:rounded-none sm:border-s sm:border-t-0 sm:motion-safe:animate-slide-in-end xl:relative xl:z-auto xl:m-2 xl:ms-0 xl:h-auto xl:shrink-0 xl:rounded-2xl xl:border xl:border-line xl:shadow-lg"
    >
      <div className="flex shrink-0 items-start gap-3 border-b border-line-subtle px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold uppercase tracking-wider text-accent">{eyebrow}</p>
          <h2 className="mt-0.5 text-base font-semibold text-fg">{title}</h2>
        </div>
        <button type="button" onClick={onClose} className="-me-1 rounded-md p-1 text-fg-muted hover:bg-surface-muted hover:text-fg" aria-label={`Close ${label.toLowerCase()}`}>
          <X className="size-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div>
    </aside>
  )
}

/** Pulse rows for the inspector's fields while they load. */
export function InspectorSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="h-16 animate-pulse rounded-lg bg-surface-muted" />
      ))}
    </div>
  )
}

/** The title's place while it loads. */
export function TitleSkeleton() {
  return <span className="block h-5 w-48 max-w-full animate-pulse rounded bg-surface-muted" aria-hidden />
}
