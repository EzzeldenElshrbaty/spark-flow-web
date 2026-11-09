import { Inbox, X } from 'lucide-react'
import type { ReactNode } from 'react'

/** An empty list (kit pattern A.4, UX Phase 4): a dashed box with one friendly sentence, and Clear when filters hide what's there. */
export function EmptyState({ children, onClear, clearLabel = 'Clear search and filters' }: { children: ReactNode; onClear?: () => void; clearLabel?: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-14 text-center motion-safe:animate-fade-in">
      <span className="rounded-full bg-accent-soft p-3 text-accent">
        <Inbox aria-hidden className="size-6" />
      </span>
      <p className="mt-3 text-sm text-fg-muted">{children}</p>
      {onClear && (
        <button type="button" onClick={onClear} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent">
          <X aria-hidden className="size-3.5" /> {clearLabel}
        </button>
      )}
    </div>
  )
}
