import { IconX } from '@tabler/icons-react'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { IconButton } from '@/components/sf/Button'

export type InspectorBodyProps = {
  /** Removes the inspector's param and keeps the rest of the URL. */
  onClose: () => void
  /** The same place as a link (for NotFound's way back). */
  closeTo: string
}

/** Where the inspector sits: beside the content on wide screens (xl), sliding over from the end side on tablets and laptops (no dimming), a bottom sheet on phones. */
const PLACE =
  'fixed inset-x-0 bottom-0 z-40 flex h-[85vh] flex-col rounded-t-2xl border-t shadow-2xl motion-safe:animate-fade-up sm:inset-x-auto sm:end-0 sm:top-0 sm:h-full sm:w-[24rem] sm:rounded-none sm:border-s sm:border-t-0 sm:motion-safe:animate-slide-in-end xl:relative xl:z-auto xl:m-2 xl:ms-0 xl:h-auto xl:shrink-0 xl:rounded-2xl xl:border xl:shadow-lg'

/**
 * The inspector's frame, after the Spark CRM page help panel (see PLACE). The body scrolls on its own. A chat panel
 * (`sub` given) takes the chat redesign's header instead (spec 6.7, .sf-panel-head): a 52px row with the title and a
 * muted subline, then the actions and Close.
 */
export function InspectorFrame({
  label,
  eyebrow,
  title,
  sub,
  actions,
  onClose,
  children,
}: {
  label: string
  eyebrow?: ReactNode
  title: ReactNode
  /** A chat panel's subline ("#backend"); giving it (even null while it loads) makes the frame a chat panel. */
  sub?: ReactNode
  /** Controls before Close (the thread's ⋮). */
  actions?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  if (sub !== undefined)
    return (
      <aside aria-label={label} className={`sf ${PLACE} border-sf-line bg-sf-surface`}>
        <header className="flex h-sf-header flex-none items-center gap-2 border-b border-sf-line ps-4 pe-2">
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <h2 className="m-0 flex-none font-sf text-[16px]/[24px] font-semibold text-sf-text">{title}</h2>
            {sub && <span className="sf-small min-w-0 truncate text-sf-text-muted">{sub}</span>}
          </div>
          {actions}
          <IconButton label={`Close ${label.toLowerCase()}`} icon={IconX} size="sm" tone="muted" onClick={onClose} />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{children}</div>
      </aside>
    )
  return (
    <aside aria-label={label} className={`${PLACE} border-line bg-surface`}>
      <div className="flex shrink-0 items-start gap-3 border-b border-line-subtle px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold uppercase tracking-wider text-accent">{eyebrow}</p>
          <h2 className="mt-0.5 text-base font-semibold text-fg">{title}</h2>
        </div>
        {actions}
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
