import { Suspense, useState } from 'react'
import { Outlet } from 'react-router'
import { Inspector } from '@/layout/Inspector'
import { PageSkeleton } from '@/layout/PageSkeleton'
import { MobileBottomBar, MobileDrawer } from '@/layout/MobileNav'
import { RealtimeBridge } from '@/layout/RealtimeBridge'
import { Sidebar } from '@/layout/Sidebar'
import { PhoneTimerBar, TimerAnnouncer } from '@/layout/TimerBar'
import { TopBar } from '@/layout/TopBar'
import { useUiStore } from '@/lib/uiStore'
import { useRole } from '@/lib/useRole'
import { AccountState } from '@/layout/AccountState'

export function AppLayout() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // The phone search screen opens from the top bar; its state lives here with the other overlays.
  const [searchOpen, setSearchOpen] = useState(false)
  // Without an account nothing below can be decided: say why instead of refusing every page.
  const account = useRole()

  return (
    // On desktop the content floats as a rounded panel on the sidebar's colour and scrolls on its own.
    // The panel is "relative" so hidden screen-reader text inside it cannot stretch the page below it.
    <div className="flex min-h-screen lg:h-screen lg:overflow-hidden lg:bg-ink-900 lg:dark:bg-surface-sunken">
      <RealtimeBridge />
      <Sidebar collapsed={collapsed} />
      <div className="relative flex min-w-0 flex-1 flex-col lg:m-2 lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-line lg:bg-canvas lg:shadow-lg">
        <TopBar
          onOpenMenu={() => setDrawerOpen(true)}
          sidebarCollapsed={collapsed}
          onToggleSidebar={toggleSidebar}
          searchOpen={searchOpen}
          onSearchOpenChange={setSearchOpen}
        />
        <main className="w-full flex-1 px-4 pb-[calc(6rem+var(--timer-bar,0px))] pt-6 md:px-6 lg:pb-10 xl:px-8">
          {/* Each page's code loads when it's first opened; this shows meanwhile (usually a blink). */}
          {account.error ? (
            <AccountState error={account.error} onRetry={account.retry} />
          ) : (
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          )}
        </main>
      </div>
      {/* Thread or ticket beside the content (xl), over it (sm–lg) or as a bottom sheet (phones); driven by the URL. */}
      <Inspector />
      <PhoneTimerBar />
      <TimerAnnouncer />
      <MobileBottomBar onOpenMore={() => setDrawerOpen(true)} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  )
}
