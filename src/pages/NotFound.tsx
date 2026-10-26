import { SearchX } from 'lucide-react'
import { Link } from 'react-router'

/** A channel, project, ticket or message that isn't there (never existed, or was removed), with a way back. */
export function NotFound({ what, backTo, backLabel }: { what: 'channel' | 'project' | 'ticket' | 'message'; backTo: string; backLabel: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-14 text-center motion-safe:animate-fade-in">
      <span className="rounded-full bg-accent-soft p-3 text-accent">
        <SearchX className="size-6" />
      </span>
      <p className="mt-3 text-sm font-medium text-fg">This {what} doesn't exist or was removed.</p>
      <Link to={backTo} className="mt-4 text-sm font-medium text-accent hover:text-accent-strong">
        {backLabel}
      </Link>
    </div>
  )
}
