import { FileSpreadsheet } from 'lucide-react'
import { apiUrl, backendOn } from '../../lib/api'

/** Downloads an Excel file from the API (for accounting). Only with the real API; the sample data has nothing to export. */
export function ExportLink({ path }: { path: string }) {
  if (!backendOn) return null
  return (
    <a
      href={apiUrl(path)}
      download
      aria-label="Export to Excel"
      title="Export to Excel"
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-surface px-3.5 py-2 text-sm font-medium text-fg ring-1 ring-line transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg-muted"
    >
      <FileSpreadsheet className="size-4" aria-hidden />
      <span className="hidden sm:inline">Export</span>
    </a>
  )
}
