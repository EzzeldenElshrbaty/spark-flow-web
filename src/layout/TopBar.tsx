import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconMenu2 } from '@tabler/icons-react'
import { IconButton } from '@/components/sf/Button'
import { DesktopSearch, PhoneSearch } from '@/layout/GlobalSearch'
import { HelpButton } from '@/layout/HelpButton'
import { NotificationsMenu } from '@/layout/NotificationsMenu'
import { TimerPill } from '@/layout/TimerBar'
import { UserMenu } from '@/layout/UserMenu'
import { WorkspaceSwitcher } from '@/layout/WorkspaceSwitcher'

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
