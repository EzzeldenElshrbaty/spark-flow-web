import clsx from 'clsx'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'
import { paths, projectTabs, type ProjectTab } from '@/lib/paths'
import { useScrollEnd } from '@/lib/useScrollEnd'

export const tabLabels: Record<ProjectTab, string> = { overview: 'Overview', tasks: 'Tasks', chat: 'Chat', time: 'Time', history: 'History', files: 'Files' }

/**
 * A project's tabs, under its header. On a phone the row scrolls sideways, the open tab comes into view, and an end
 * fade says more tabs are there; with `sticky` it stays under the top bar, naming the project once the header has
 * scrolled away (`stuckName`, UX Phase 5B, 5.1, 5.2).
 */
export function ProjectTabs({
  ws,
  projectKey,
  tab,
  end,
  sticky = false,
  stuckName,
}: {
  ws: string
  projectKey: string
  tab: ProjectTab
  end?: ReactNode
  sticky?: boolean
  stuckName?: string
}) {
  const row = useRef<HTMLElement>(null)
  const more = useScrollEnd(row)
  const open = useRef<HTMLAnchorElement>(null)
  // Sideways only, by as little as it takes (either way, so right to left too): the page itself mustn't move.
  useEffect(() => {
    if (!row.current || !open.current) return
    const r = row.current.getBoundingClientRect()
    const t = open.current.getBoundingClientRect()
    const by = t.left < r.left ? t.left - r.left : t.right > r.right ? t.right - r.right : 0
    if (by) row.current.scrollBy({ left: by })
    // Again when the stuck row's name takes room from the tabs (UX Phase 5B final review).
  }, [tab, Boolean(stuckName)])
  return (
    // `end` sits at the row's end (the Chat tab's Open in Chat, UX Phase 1, 1.3).
    <div className={clsx('mb-5 flex', sticky && 'max-sm:sticky max-sm:top-14 max-sm:z-10 max-sm:-mx-4 max-sm:bg-canvas max-sm:px-4')}>
      {stuckName && (
        <span data-stuck-name className="flex max-w-[40%] shrink-0 items-center truncate border-b border-line pe-2 text-sm font-semibold text-fg sm:hidden">
          {stuckName}
        </span>
      )}
      <div className="relative flex min-w-0 flex-1">
      <nav ref={row} className="flex min-w-0 flex-1 gap-1 overflow-x-auto border-b border-line" aria-label="Project">
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
      {/* More tabs past the end edge (UX Phase 5B, 5.2). */}
      {more && <span data-more-tabs aria-hidden className="pointer-events-none absolute inset-y-0 end-0 w-8 bg-linear-to-l from-canvas rtl:bg-linear-to-r" />}
      </div>
      {end && <div className="flex shrink-0 items-center border-b border-line ps-3">{end}</div>}
    </div>
  )
}
