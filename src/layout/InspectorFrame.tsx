import { IconX } from '@tabler/icons-react'
import { X } from 'lucide-react'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { IconButton } from '@/components/sf/Button'
import { trapTab } from '@/components/sf/layers'
import { useMedia } from '@/components/sf/usePhone'

export type InspectorBodyProps = {
  /** Removes the inspector's param and keeps the rest of the URL. */
  onClose: () => void
  /** The same place as a link (for NotFound's way back). */
  closeTo: string
}

/**
 * Whether the panel was opened (or moved to another record) after the page loaded: then it takes focus, so the
 * keyboard carries on in it (UX Phase 5A, 5.5). The Inspector provides it from `useInspectorFocus`.
 */
export const PanelOpened = createContext(false)

/**
 * Below `xl` the panel covers the page (a bottom sheet below `sm`, a side sheet up to 1279px): there it is a modal
 * dialog over a dimmed page (UX Phase 5A, 5.5; tablets too, UX Phase 5B).
 */
const OVERLAY_QUERY = '(max-width: 1279px)'

/** Where the inspector sits: beside the content on wide screens (xl), sliding over from the end side on tablets and laptops (no dimming), a bottom sheet on phones. */
const PLACE =
  'fixed inset-x-0 bottom-0 z-40 flex h-[85vh] flex-col rounded-t-2xl border-t shadow-2xl motion-safe:animate-fade-up sm:inset-x-auto sm:end-0 sm:top-0 sm:h-full sm:w-[24rem] sm:rounded-none sm:border-s sm:border-t-0 sm:motion-safe:animate-slide-in-end xl:relative xl:z-auto xl:m-2 xl:ms-0 xl:h-auto xl:shrink-0 xl:rounded-2xl xl:border xl:shadow-lg'

/**
 * The inspector's frame, after the Spark CRM page help panel (see PLACE). The body scrolls on its own. A chat panel
 * (`sub` given) takes the chat redesign's header instead (spec 6.7, .sf-panel-head): a 52px row with the title and a
 * muted subline, then the actions and Close.
 * Opened by a person, it puts focus on its title, unless something inside took it first (a reply box). Wherever it
 * covers the page (below 1280px) it is a modal over a dimmed page: Tab stays inside, and a tap on the dimmed part
 * closes it (UX Phase 5A; tablets too, UX Phase 5B).
 */
export function InspectorFrame({
  label,
  eyebrow,
  title,
  sub,
  actions,
  onClose,
  focusTitle = false,
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
  /** Puts focus on the title when it opens (File details, opened from a card), so the keyboard carries on here. */
  focusTitle?: boolean
  children: ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const opened = useContext(PanelOpened)
  // Decided once, as the frame mounts (the Inspector remounts it for each record).
  const [focusAtStart] = useState(focusTitle || opened)
  useEffect(() => {
    if (!focusAtStart) return
    // After every effect of this render, so the Inspector first notes what opened the panel (to give focus back).
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled && !rootRef.current?.contains(document.activeElement)) titleRef.current?.focus({ preventScroll: true })
    })
    return () => {
      cancelled = true
    }
  }, [focusAtStart])
  const sheet = useMedia(OVERLAY_QUERY)
  // The phone's sheet is a dialog; elsewhere the panel sits beside the page. One element either way, so a resize
  // keeps what's typed in it.
  const frame = (className: string, content: ReactNode) => (
    <>
      {sheet && <div className="fixed inset-0 z-40 bg-black/40 motion-safe:animate-fade-in" aria-hidden data-scrim onClick={onClose} />}
      <div
        ref={rootRef}
        role={sheet ? 'dialog' : 'complementary'}
        aria-modal={sheet || undefined}
        aria-label={label}
        data-inspector
        className={className}
        onKeyDown={(event) => {
          if (sheet && rootRef.current?.contains(event.target as Node)) trapTab(event, rootRef.current)
        }}
      >
        {content}
      </div>
    </>
  )
  if (sub !== undefined)
    return frame(
      `sf ${PLACE} border-sf-line bg-sf-surface`,
      <>
        <header className="flex h-sf-header flex-none items-center gap-2 border-b border-sf-line ps-4 pe-2">
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <h2 ref={titleRef} tabIndex={-1} className="m-0 flex-none font-sf text-[16px]/[24px] font-semibold text-sf-text outline-none">{title}</h2>
            {sub && <span className="sf-small min-w-0 truncate text-sf-text-muted">{sub}</span>}
          </div>
          {actions}
          <IconButton label={`Close ${label.toLowerCase()}`} icon={IconX} size="sm" tone="muted" onClick={onClose} className="max-md:touch-target" />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{children}</div>
      </>,
    )
  return frame(
    `${PLACE} border-line bg-surface`,
    <>
      <div className="flex shrink-0 items-start gap-3 border-b border-line-subtle px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold uppercase tracking-wider text-accent">{eyebrow}</p>
          <h2 ref={titleRef} tabIndex={-1} className="mt-0.5 text-base font-semibold text-fg outline-none">
            {title}
          </h2>
        </div>
        {actions}
        <button type="button" onClick={onClose} className="-me-1 rounded-md p-1 text-fg-muted hover:bg-surface-muted hover:text-fg max-md:touch-target" aria-label={`Close ${label.toLowerCase()}`} title={`Close ${label.toLowerCase()}`}>
          <X className="size-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div>
    </>,
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
