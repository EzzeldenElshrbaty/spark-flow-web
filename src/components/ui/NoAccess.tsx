import { Link } from 'react-router'
import { paths } from '@/lib/paths'

/** A page I may not open: what it is, and the way back to the Dashboard, everyone's start page (UX Phase 2, 2.1). */
export function NoAccess({ ws, what }: { ws: string; what: string }) {
  return (
    <p className="text-sm text-fg-secondary">
      You don’t have access to {what}.{' '}
      <Link to={paths.start(ws)} className="font-medium text-accent hover:text-accent-strong">
        Go to Dashboard
      </Link>
    </p>
  )
}
