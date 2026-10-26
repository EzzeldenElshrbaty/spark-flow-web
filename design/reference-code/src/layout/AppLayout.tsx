import { Suspense, useMemo, useState } from 'react'
import { Outlet } from 'react-router'
import { ActivityTracker } from './ActivityTracker'
import { PageHelpContext } from '../lib/usePageHelp'
import { MobileBottomBar, MobileDrawer } from './MobileNav'
import { PageHelpPanel } from './PageHelpPanel'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { ViewingAsBanner } from './ViewingAsBanner'

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const pageHelp = useMemo(() => ({ open: helpOpen, setOpen: setHelpOpen }), [helpOpen])

  return (
    // On desktop the content floats as a rounded panel on the sidebar's colour and scrolls on its own.
    // The panel is "relative" so hidden screen-reader text inside it cannot stretch the page below it.
    <PageHelpContext.Provider value={pageHelp}>
      <div className="flex min-h-screen lg:h-screen lg:overflow-hidden lg:bg-ink-900 lg:dark:bg-surface-sunken">
        <ActivityTracker />
        <Sidebar collapsed={collapsed} />
        <div className="relative flex min-w-0 flex-1 flex-col lg:m-2 lg:overflow-y-auto lg:rounded-2xl lg:border lg:border-line lg:bg-canvas lg:shadow-lg">
          {/* The "Viewing as" banner stays on screen with the top bar. */}
          <div className="sticky top-0 z-20">
            <ViewingAsBanner />
            <TopBar
              onOpenMenu={() => setDrawerOpen(true)}
              sidebarCollapsed={collapsed}
              onToggleSidebar={() => setCollapsed((value) => !value)}
            />
          </div>
          <main className="w-full flex-1 px-4 pb-24 pt-6 md:px-6 lg:pb-10 xl:px-8">
            {/* Each page's code loads when it's first opened; this shows meanwhile (usually a blink). */}
            <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-surface-strong" />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
        {/* Help for the page: beside it on the widest screens, over it on smaller ones. */}
        <PageHelpPanel />
        <MobileBottomBar onOpenMore={() => setDrawerOpen(true)} />
        <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      </div>
    </PageHelpContext.Provider>
  )
}
