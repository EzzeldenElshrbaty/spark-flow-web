import clsx from 'clsx'
import { Ellipsis, FolderKanban, MessagesSquare, Search, X, type LucideIcon } from 'lucide-react'
import { NavLink, useMatch } from 'react-router'
import { useChannels } from '@/api/chat'
import { useProjects } from '@/api/tickets'
import { Logo, SidebarContent } from '@/layout/Sidebar'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { landingPath, paths, savedPlace, validSavedPlace } from '@/lib/paths'
import { useUiStore } from '@/lib/uiStore'

const itemClass = 'flex w-full flex-col items-center gap-1 py-2 text-[11px] font-medium'

/** A bottom-bar tab that is a link; without a place to go yet (the workspace is still loading) it waits, dimmed. */
function TabLink({ to, active, icon: Icon, label }: { to: string | undefined; active: boolean; icon: LucideIcon; label: string }) {
  if (!to)
    return (
      <button type="button" disabled className={clsx(itemClass, 'text-fg-muted opacity-50')}>
        <Icon className="size-5" />
        {label}
      </button>
    )
  return (
    <NavLink to={to} className={clsx(itemClass, active ? 'text-accent' : 'text-fg-muted')}>
      <Icon className="size-5" />
      {label}
    </NavLink>
  )
}

/** Chat · Projects · Search · More. Chat and Projects reopen what you last had open there. */
export function MobileBottomBar({ onOpenMore, onOpenSearch }: { onOpenMore: () => void; onOpenSearch: () => void }) {
  const { workspace } = useCurrentWorkspace()
  const lastVisited = useUiStore((state) => state.lastVisited)
  const lastProjectView = useUiStore((state) => state.lastProjectView)
  const channels = useChannels(workspace?.id).data
  const projects = useProjects(workspace?.id).data
  const inChat = useMatch('/w/:ws/c/*') !== null
  const inProjects = useMatch('/w/:ws/p/*') !== null

  const slug = workspace?.slug
  const saved = slug ? savedPlace(slug, lastVisited) : undefined
  // A saved place is only used while it still leads somewhere (its channel or project may be gone).
  const usable = saved && channels && projects && validSavedPlace(saved, channels, projects) ? saved : undefined
  const chatTo = slug && channels ? (usable?.startsWith(`/w/${slug}/c/`) ? usable : landingPath(slug, {}, channels)) : undefined
  const firstProject = projects?.[0]
  const projectsTo =
    slug && projects
      ? usable?.startsWith(`/w/${slug}/p/`)
        ? usable
        : firstProject
          ? paths.project(slug, firstProject.key, lastProjectView[firstProject.key])
          : undefined
      : undefined

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Main">
      <ul className="flex">
        <li className="flex-1">
          <TabLink to={chatTo} active={inChat} icon={MessagesSquare} label="Chat" />
        </li>
        <li className="flex-1">
          <TabLink to={projectsTo} active={inProjects} icon={FolderKanban} label="Projects" />
        </li>
        {/* From tablet width the top bar has its own search box. */}
        <li className="flex-1 md:hidden">
          <button type="button" onClick={onOpenSearch} className={clsx(itemClass, 'text-fg-muted')}>
            <Search className="size-5" />
            Search
          </button>
        </li>
        <li className="flex-1">
          <button type="button" onClick={onOpenMore} className={clsx(itemClass, 'text-fg-muted')}>
            <Ellipsis className="size-5" />
            More
          </button>
        </li>
      </ul>
    </nav>
  )
}

export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="Close menu" />
      <div className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-ink-900 shadow-xl dark:bg-surface-sunken">
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          <Logo onClick={onClose} />
          <button type="button" onClick={onClose} className="rounded-md p-1 text-neutral-400 hover:text-white" aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <SidebarContent onNavigate={onClose} />
        </div>
      </div>
    </div>
  )
}
