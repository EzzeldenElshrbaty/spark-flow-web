import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { DesktopSearch, PhoneSearch } from '@/layout/GlobalSearch'
import { NotificationsMenu } from '@/layout/NotificationsMenu'
import { UserMenu } from '@/layout/UserMenu'
import { WorkspaceSwitcher } from '@/layout/WorkspaceSwitcher'

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
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-1.5 border-b border-line bg-surface/90 px-4 backdrop-blur sm:gap-3 md:px-6 xl:px-8">
      <button type="button" onClick={onOpenMenu} className="-ms-2 rounded-md p-2 text-fg-tertiary hover:bg-surface-muted lg:hidden" aria-label="Open menu">
        <Menu className="size-5" />
      </button>
      <button
        type="button"
        onClick={onToggleSidebar}
        className="-ms-2 hidden rounded-md p-2 text-fg-tertiary hover:bg-surface-muted hover:text-fg lg:block"
        aria-label={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
        title={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
      >
        {sidebarCollapsed ? <PanelLeftOpen className="size-5 rtl:-scale-x-100" /> : <PanelLeftClose className="size-5 rtl:-scale-x-100" />}
      </button>

      <DesktopSearch />

      <div className="ms-auto flex items-center gap-1 sm:gap-2">
        <PhoneSearch open={searchOpen} onOpenChange={onSearchOpenChange} />

        <NotificationsMenu />

        <WorkspaceSwitcher />

        <UserMenu />
      </div>
    </header>
  )
}
