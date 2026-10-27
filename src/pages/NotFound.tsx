import { SearchX } from 'lucide-react'
import { Link } from 'react-router'

const sentence = {
  page: "This page doesn't exist.",
  workspace: "This workspace doesn't exist or you're not in it.",
}

/** A channel, project, ticket, message, page or workspace that isn't there, with a way back. */
export function NotFound({ what, backTo, backLabel }: { what: 'channel' | 'project' | 'ticket' | 'message' | 'page' | 'workspace'; backTo: string; backLabel: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-14 text-center motion-safe:animate-fade-in">
      <span className="rounded-full bg-accent-soft p-3 text-accent">
        <SearchX className="size-6" />
      </span>
      <p className="mt-3 text-sm font-medium text-fg">{what === 'page' || what === 'workspace' ? sentence[what] : `This ${what} doesn't exist or was removed.`}</p>
      <Link to={backTo} className="mt-4 text-sm font-medium text-accent hover:text-accent-strong">
        {backLabel}
      </Link>
    </div>
  )
}
