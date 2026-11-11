import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { appPath } from '@/lib/appLink'

/**
 * A channel bookmark's link: one to Flow itself (Link a project, chat spec 6.14) moves inside the app; any other opens
 * a new browser tab. The tab row and Channel details › Tabs both use it (polish pass).
 */
export function BookmarkLink({ url, className, children }: { url: string; className: string; children: ReactNode }) {
  const inApp = appPath(url)
  return inApp ? (
    <Link to={inApp} className={className}>
      {children}
    </Link>
  ) : (
    <a href={url} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  )
}
