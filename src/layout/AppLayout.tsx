import clsx from 'clsx'
import { Suspense, useLayoutEffect, useState } from 'react'
import { Announcer } from '@/components/sf/Announcer'
import { UnsavedChangesBlocker } from './UnsavedChangesBlocker'
import { ToastProvider, ToastRegion } from '@/components/sf/Toast'
import { Navigate, Outlet, useLocation, useMatches } from 'react-router'
import { ActivityTracker } from '@/layout/ActivityTracker'
import { DesktopNotifier } from '@/layout/DesktopNotifier'
import { Inspector } from '@/layout/Inspector'
import { PageHelpPanel } from '@/layout/PageHelpPanel'
import { PageSkeleton } from '@/layout/PageSkeleton'
import { RouteFocus } from '@/layout/RouteFocus'
import { SkipLink } from '@/layout/SkipLink'
import { MobileBottomBar, MobileDrawer } from '@/layout/MobileNav'
import { RealtimeBridge } from '@/layout/RealtimeBridge'
import { isFill, mainCardClass, screenFont } from '@/layout/mainCard'
import { Sidebar } from '@/layout/Sidebar'
import { StillWorkingDialog } from '@/layout/StillWorkingDialog'
import { PhoneTimerBar, TimerAnnouncer } from '@/layout/TimerBar'
import { TopBar } from '@/layout/TopBar'
import { useAppShortcuts } from '@/layout/useAppShortcuts'
import { useModeShortcuts } from '@/layout/useModeShortcuts'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { useUiStore } from '@/lib/uiStore'
import { useRole } from '@/lib/useRole'
import { AccountState } from '@/layout/AccountState'

export function AppLayout() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // The phone search screen opens from the top bar; its state lives here with the other overlays.
  const [searchOpen, setSearchOpen] = useState(false)
  // ⌘/Ctrl+Shift+A for Activity and ⌘/Ctrl+Shift+T for Threads, anywhere in the workspace (spec 10, 6.12).
  useAppShortcuts(useCurrentWorkspace().workspace?.slug)
  // G then P / G then C: the two sides of Flow (spec 5.5).
  useModeShortcuts()
  // Without an account nothing below can be decided: say why instead of refusing every page.
  const account = useRole()
  const signedOut = account.signedOut
  const location = useLocation()
  // A pane page (a channel) fills the card instead of scrolling inside the padded page column.
  const matches = useMatches()
  const pane = matches.some((match) => (match.handle as { pane?: boolean } | undefined)?.pane)
  // A page that fills the card on the page canvas (the project Chat tab, UX Phase 1, 1.3).
  const fill = !pane && isFill(matches)
  // One font per screen (UX Phase 3, 3.1): set before paint, so the shell never shows the other font first.
  const font = screenFont(pane)
  useLayoutEffect(() => {
    document.documentElement.dataset.font = font
  }, [font])
  useLayoutEffect(() => () => void delete document.documentElement.dataset.font, [])

  return (
    // On desktop the content floats as a rounded panel on the sidebar's colour and scrolls on its own.
    // The panel is "relative" so hidden screen-reader text inside it cannot stretch the page below it.
    <ToastProvider>
      <div className={clsx('flex lg:h-screen lg:overflow-hidden', pane || fill ? 'h-dvh overflow-hidden' : 'min-h-screen')}>
        {/* The first Tab stop (UX Phase 5A, 5.7). */}
        <SkipLink />
        {/* The dark frame behind the sidebar and the card. Its own .sf element, so the chat tokens don't reach the pages. */}
        <div aria-hidden className="sf fixed inset-0 -z-10 hidden bg-sf-app-frame lg:block" />
        <RealtimeBridge />
        <DesktopNotifier />
        <ActivityTracker />
        <Announcer />
        {/* Unsaved forms ask before Back or another page takes them away (UX Phase 1, 1.2). */}
        <UnsavedChangesBlocker />
        <Sidebar collapsed={collapsed} />
        {/* The main card (spec 5.3); the top bar stays put and the page scrolls under it. */}
        <div className={mainCardClass(pane)}>
          <TopBar
            onOpenMenu={() => setDrawerOpen(true)}
            sidebarCollapsed={collapsed}
            onToggleSidebar={toggleSidebar}
            searchOpen={searchOpen}
            onSearchOpenChange={setSearchOpen}
          />
          {/* The scroller has no padding of its own, so sticky parts of a page (the channel composer) stick to its edge. */}
          <div className={clsx('flex flex-1 flex-col', pane || fill ? 'min-h-0' : 'lg:min-h-0 lg:overflow-y-auto')}>
            <main
              id="main"
              tabIndex={-1}
              className={clsx(
                'outline-none',
                pane
                  ? // The phone bottom bar (and the timer bar) cover the page's end; the pane stops above them.
                    'flex min-h-0 w-full flex-1 flex-col pb-[calc(3.5rem+var(--timer-bar,0px)+env(safe-area-inset-bottom))] lg:pb-0'
                  : fill
                    ? // The page's padding, its content filling the height left, above the phone bars; it scrolls only
                      // when a short screen can't fit the content's floor.
                      'flex min-h-0 w-full flex-1 flex-col overflow-y-auto px-4 pb-[calc(4rem+var(--timer-bar,0px)+env(safe-area-inset-bottom))] pt-4 md:px-6 lg:pb-4 lg:pt-6 xl:px-8'
                    : 'w-full flex-1 px-4 pb-[calc(6rem+var(--timer-bar,0px))] pt-6 md:px-6 lg:pb-10 xl:px-8',
              )}
            >
              {/* Each page's code loads when it's first opened; this shows meanwhile (usually a blink). */}
              {signedOut ? (
                // Signed out (slice AB): Sign in, then back here. A deactivated account is told why.
                <Navigate to={`/signin?returnTo=${encodeURIComponent(location.pathname + location.search + location.hash)}${account.deactivated ? '&why=deactivated' : ''}`} replace />
              ) : account.error ? (
                <AccountState error={account.error} onRetry={account.retry} retrying={account.retrying} />
              ) : (
                <Suspense fallback={<PageSkeleton />}>
                  <Outlet />
                </Suspense>
              )}
            </main>
          </div>
          <ToastRegion />
        </div>
        {/* Thread or ticket beside the content (xl), over it (sm–lg) or as a bottom sheet (phones); driven by the URL.
            Not without an account: nothing in it could load either. */}
        {!account.error && <Inspector />}
        {/* Help for the page: beside the card from 1536px, over it narrower, rising from the bottom on phones. */}
        {!account.error && <PageHelpPanel />}
        <RouteFocus />
        <PhoneTimerBar />
        <TimerAnnouncer />
        {!account.error && <StillWorkingDialog />}
        <MobileBottomBar onOpenMore={() => setDrawerOpen(true)} />
        <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      </div>
    </ToastProvider>
  )
}
