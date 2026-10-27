import clsx from 'clsx'
import { Ellipsis, FolderKanban, House, MessagesSquare, type LucideIcon } from 'lucide-react'
import { IconX } from '@tabler/icons-react'
import { useRef } from 'react'
import { NavLink, useMatch } from 'react-router'
import { useChannels } from '@/api/chat'
import { useProjects } from '@/api/tickets'
import { IconButton } from '@/components/sf/Button'
import { Logo, SidebarContent } from '@/layout/Sidebar'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { landingPath, paths, savedPlace, validSavedPlace } from '@/lib/paths'
import { useDialogFocus } from '@/lib/useDialogFocus'
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

/** Home · Projects · Chat · More (search is in the top bar). Chat and Projects reopen what you last had open there. */
export function MobileBottomBar({ onOpenMore }: { onOpenMore: () => void }) {
  const { workspace } = useCurrentWorkspace()
  const lastVisited = useUiStore((state) => state.lastVisited)
  const channels = useChannels(workspace?.id).data
  const projects = useProjects(workspace?.id).data
  const inChat = useMatch('/w/:ws/c/*') !== null
  const inHome = useMatch({ path: '/w/:ws', end: true }) !== null
  // Every hook runs every render: the three matches are read first, then combined.
  const inProject = useMatch('/w/:ws/p/*') !== null
  const inProjectList = useMatch('/w/:ws/projects') !== null
  const inMyTasks = useMatch('/w/:ws/tasks') !== null
  const inProjects = inProject || inProjectList || inMyTasks

  const slug = workspace?.slug
  const saved = slug ? savedPlace(slug, lastVisited) : undefined
  // A saved place is only used while it still leads somewhere (its channel or project may be gone).
  const usable = saved && channels && projects && validSavedPlace(saved, channels, projects) ? saved : undefined
  const chatTo = slug && channels ? (usable?.startsWith(`/w/${slug}/c/`) ? usable : landingPath(slug, {}, channels)) : undefined
  const projectsTo = slug ? (usable?.startsWith(`/w/${slug}/p/`) ? usable : paths.projects(slug)) : undefined

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Main">
      <ul className="flex">
        <li className="flex-1">
          <TabLink to={slug ? paths.home(slug) : undefined} active={inHome} icon={House} label="Home" />
        </li>
        <li className="flex-1">
          <TabLink to={projectsTo} active={inProjects} icon={FolderKanban} label="Projects" />
        </li>
        <li className="flex-1">
          <TabLink to={chatTo} active={inChat} icon={MessagesSquare} label="Chat" />
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
  const ref = useRef<HTMLDivElement>(null)
  useDialogFocus(open, ref, onClose)
  if (!open) return null
  return (
    <div ref={ref} className="sf fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <button type="button" tabIndex={-1} className="absolute inset-0 bg-sf-overlay" onClick={onClose} aria-label="Close menu" />
      {/* Focusable, so a click on its padding keeps focus in the drawer (Tab and Escape still work). */}
      <div tabIndex={-1} className="absolute inset-y-0 start-0 flex w-sf-sidebar max-w-[85vw] flex-col bg-sf-app-frame shadow-sf-modal outline-none">
        <div className="flex h-14 flex-none items-center justify-between ps-2 pe-3">
          <Logo onClick={onClose} />
          <IconButton label="Close menu" icon={IconX} tone="sidebar" tooltip={false} onClick={onClose} data-autofocus />
        </div>
        <div className="min-h-0 flex-1">
          <SidebarContent onNavigate={onClose} />
        </div>
      </div>
    </div>
  )
}
