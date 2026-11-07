import clsx from 'clsx'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { paths, projectTabs, type ProjectTab } from '@/lib/paths'

const tabLabels: Record<ProjectTab, string> = { overview: 'Overview', tasks: 'Tasks', chat: 'Chat', time: 'Time', history: 'History', files: 'Files' }

/** A project's tabs, under its header. On a phone the row scrolls sideways, and the open tab comes into view. */
export function ProjectTabs({ ws, projectKey, tab }: { ws: string; projectKey: string; tab: ProjectTab }) {
  const row = useRef<HTMLElement>(null)
  const open = useRef<HTMLAnchorElement>(null)
  // Sideways only, by as little as it takes (either way, so right to left too): the page itself mustn't move.
  useEffect(() => {
    if (!row.current || !open.current) return
    const r = row.current.getBoundingClientRect()
    const t = open.current.getBoundingClientRect()
    const by = t.left < r.left ? t.left - r.left : t.right > r.right ? t.right - r.right : 0
    if (by) row.current.scrollBy({ left: by })
  }, [tab])
  return (
    <nav ref={row} className="mb-5 flex gap-1 overflow-x-auto border-b border-line" aria-label="Project">
      {projectTabs.map((value) => (
        <Link
          key={value}
          ref={tab === value ? open : undefined}
          to={paths.project(ws, projectKey, value)}
          aria-current={tab === value ? 'page' : undefined}
          className={clsx(
            'relative flex shrink-0 items-center gap-2 px-3 py-2 text-sm font-medium transition-colors',
            "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand-500 after:transition-transform after:duration-200 after:content-['']",
            tab === value ? 'text-fg after:scale-x-100' : 'text-fg-muted after:scale-x-0 hover:text-fg',
          )}
        >
          {tabLabels[value]}
        </Link>
      ))}
    </nav>
  )
}
