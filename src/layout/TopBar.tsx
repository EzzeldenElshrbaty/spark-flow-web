import { IconHelpCircle, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconMenu2 } from '@tabler/icons-react'
import { IconButton } from '@/components/sf/Button'
import { DesktopSearch, PhoneSearch } from '@/layout/GlobalSearch'
import { NotificationsMenu } from '@/layout/NotificationsMenu'
import { useSearchParams } from 'react-router'
import { HELP_BUTTON_ID, usePageHelp } from '@/layout/PageHelpPanel'
import { parseInspector, withInspector } from '@/lib/inspector'
import { useUiStore } from '@/lib/uiStore'
import { TimerPill } from '@/layout/TimerBar'
import { UserMenu } from '@/layout/UserMenu'
import { WorkspaceSwitcher } from '@/layout/WorkspaceSwitcher'

/** The round "?" beside the bell (slice 6): help for this page, beside it. Hidden on a page without help. */
function HelpButton() {
  const help = usePageHelp()
  const open = useUiStore((state) => state.helpOpen)
  const setOpen = useUiStore((state) => state.setHelpOpen)
  const [params, setParams] = useSearchParams()
  if (!help) return null
  const toggle = () => {
    // One side panel at a time: help takes the place of a thread, task or file.
    if (!open && parseInspector(params)) setParams((current) => withInspector(current, null))
    setOpen(!open)
  }
  return (
    <IconButton
      id={HELP_BUTTON_ID}
      label="Help for this page"
      icon={IconHelpCircle}
      aria-expanded={open}
      aria-controls={open ? 'page-help' : undefined}
      className={open ? 'bg-sf-surface-hover text-sf-text' : undefined}
      onClick={toggle}
    />
  )
}

/** 56px bar at the top of the main card (spec 5.2): toggle, search, then the timer, help, bell, workspace and profile. */
export function TopBar({
  onOpenMenu,
  sidebarCollapsed,
  onToggleSidebar,
  searchOpen,
  onSearchOpenChange,
}: {
  onOpenMenu: () => void
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  searchOpen: boolean
  onSearchOpenChange: (open: boolean) => void
}) {
  return (
    <header className="sf sticky top-0 z-20 flex h-sf-topbar flex-none items-center gap-2 border-b border-sf-line bg-sf-surface ps-3 pe-4">
      <span className="lg:hidden">
        <IconButton label="Open menu" icon={IconMenu2} onClick={onOpenMenu} />
      </span>
      <span className="hidden lg:block">
        <IconButton
          label={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
          icon={sidebarCollapsed ? IconLayoutSidebarLeftExpand : IconLayoutSidebarLeftCollapse}
          flip
          onClick={onToggleSidebar}
        />
      </span>

      <DesktopSearch />

      {/* The search box gives way first; the buttons and the profile keep their size. */}
      <div className="ms-auto flex flex-none items-center gap-2">
        <TimerPill />
        <PhoneSearch open={searchOpen} onOpenChange={onSearchOpenChange} />
        <HelpButton />
        <NotificationsMenu />
        <WorkspaceSwitcher />
        <UserMenu />
      </div>
    </header>
  )
}
