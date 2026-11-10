import type { ReactNode } from 'react'
import { useDocumentTitle } from '@/lib/useDocumentTitle'

/** Page title on the left, its actions on the right of the same row at every width. */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  // The page's title names its browser tab too (UX Phase 5A, 5.7).
  useDocumentTitle([title])
  return (
    <div className="mb-6 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
      </div>
    </div>
  )
}
