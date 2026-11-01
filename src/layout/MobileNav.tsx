import clsx from 'clsx'
import { IconDots, IconHome, IconLayoutKanban, IconMessages, IconX, type TablerIcon } from '@tabler/icons-react'
import { useRef } from 'react'
import { NavLink, useLocation, useMatch } from 'react-router'
import { IconButton } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { WorkspaceModeSwitch } from '@/layout/ModeSwitch'
import { Logo, SidebarContent } from '@/layout/Sidebar'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { useModeTarget } from '@/layout/useGoToMode'
import { paths } from '@/lib/paths'
import { useDialogFocus } from '@/lib/useDialogFocus'
import { modeOf } from '@/lib/workspaceMode'

const itemClass = 'sf-focus flex min-h-11 w-full flex-col items-center gap-1 py-2 font-sf text-[11px]/[14px] font-medium'

/** A bottom-bar tab that is a link; without a place to go yet (the workspace is still loading) it waits, dimmed. */
function TabLink({ to, active, icon, label }: { to: string | undefined; active: boolean; icon: TablerIcon; label: string }) {
  if (!to)
    return (
      <button type="button" disabled className={clsx(itemClass, 'text-sf-text-muted opacity-50')}>
        <Icon icon={icon} />
        {label}
      </button>
    )
  return (
    <NavLink to={to} className={clsx(itemClass, active ? 'text-sf-accent' : 'text-sf-text-muted')}>
      <Icon icon={icon} />
      {label}
    </NavLink>
  )
}

/**
 * Home · Projects · Chat · More (search is in the top bar). Chat and Projects reopen the last place on their side
 * (spec 5.5), as the sidebar's switch does; Home has its own tab, so Projects starts on the project list.
 */
export function MobileBottomBar({ onOpenMore }: { onOpenMore: () => void }) {
  const { workspace } = useCurrentWorkspace()
  const { pathname } = useLocation()
  const inHome = useMatch({ path: '/w/:ws', end: true }) !== null
  const side = modeOf(pathname)
  const inChat = side === 'chat'
  const inProjects = side === 'projects' && !inHome

  const slug = workspace?.slug
  const chatTo = useModeTarget('chat')
  const projectsTarget = useModeTarget('projects')
  const projectsTo = slug && projectsTarget === paths.home(slug) ? paths.projects(slug) : projectsTarget

  return (
    <nav className="sf fixed inset-x-0 bottom-0 z-30 border-t border-sf-line bg-sf-surface pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Main">
      <ul className="flex">
        <li className="flex-1">
          <TabLink to={slug ? paths.home(slug) : undefined} active={inHome} icon={IconHome} label="Home" />
        </li>
        <li className="flex-1">
          <TabLink to={projectsTo} active={inProjects} icon={IconLayoutKanban} label="Projects" />
        </li>
        <li className="flex-1">
          <TabLink to={chatTo} active={inChat} icon={IconMessages} label="Chat" />
        </li>
        <li className="flex-1">
          <button type="button" onClick={onOpenMore} className={clsx(itemClass, 'cursor-pointer text-sf-text-muted')}>
            <Icon icon={IconDots} />
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
          <IconButton label="Close menu" icon={IconX} tone="sidebar" onClick={onClose} data-autofocus />
        </div>
        <div className="flex flex-none px-2 pb-3">
          <WorkspaceModeSwitch size="phone" />
        </div>
        <div className="min-h-0 flex-1">
          <SidebarContent onNavigate={onClose} />
        </div>
      </div>
    </div>
  )
}
