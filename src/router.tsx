import { NotFound } from '@/pages/NotFound'
import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, Navigate, useLocation, useParams, type RouteObject } from 'react-router'
import { AppLayout } from '@/layout/AppLayout'
import { LastVisitRedirect } from '@/layout/LastVisitRedirect'
import { WorkspaceGate } from '@/layout/WorkspaceGate'
import { legacyProjectPath, paths, projectTabs } from '@/lib/paths'

/**
 * A page whose code downloads the first time it's opened, so the first visit only loads what it shows.
 * AppLayout's Suspense covers the moment it takes.
 */
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((module) => ({ default: module[name] })))
}

const ChannelPage = page(() => import('@/pages/chat/ChannelPage'), 'ChannelPage')
const ProjectPage = page(() => import('@/pages/projects/ProjectPage'), 'ProjectPage')
const MyWorkPage = page(() => import('@/pages/home/MyWorkPage'), 'MyWorkPage')
const MyTasksRedirect = page(() => import('@/pages/home/MyWorkPage'), 'MyTasksRedirect')
const DashboardPage = page(() => import('@/pages/dashboard/DashboardPage'), 'DashboardPage')
const TimeCostPage = page(() => import('@/pages/time/TimeCostPage'), 'TimeCostPage')
const TeamsPage = page(() => import('@/pages/teams/TeamsPage'), 'TeamsPage')
const ProjectsPage = page(() => import('@/pages/projects/ProjectsPage'), 'ProjectsPage')
const SettingsPage = page(() => import('@/pages/settings/SettingsPage'), 'SettingsPage')
const DatabasePage = page(() => import('@/pages/settings/DatabasePage'), 'DatabasePage')
const RatesPage = page(() => import('@/pages/settings/RatesPage'), 'RatesPage')
const RolesPage = page(() => import('@/pages/settings/RolesPage'), 'RolesPage')
const UsersPage = page(() => import('@/pages/settings/UsersPage'), 'UsersPage')
const ArchivedPage = page(() => import('@/pages/settings/ArchivedPage'), 'ArchivedPage')
const AttendancePage = page(() => import('@/pages/settings/AttendancePage'), 'AttendancePage')
const AuditLogPage = page(() => import('@/pages/settings/AuditLogPage'), 'AuditLogPage')
const ActivityPage = page(() => import('@/pages/chat/ActivityPage'), 'ActivityPage')
const ThreadsPage = page(() => import('@/pages/chat/threads/ThreadsPage'), 'ThreadsPage')
const SearchPage = page(() => import('@/pages/chat/search/SearchPage'), 'SearchPage')
const PreferencesPage = page(() => import('@/pages/preferences/PreferencesPage'), 'PreferencesPage')
const SavedPage = page(() => import('@/pages/chat/saved/SavedPage'), 'SavedPage')
const DraftsPage = page(() => import('@/pages/chat/outbox/DraftsPage'), 'DraftsPage')
const HelpPage = page(() => import('@/pages/help/HelpPage'), 'HelpPage')
const SignInPage = page(() => import('@/pages/signin/SignInPage'), 'SignInPage')

/** `/w/:ws/p/:projectKey` has no page of its own: it opens the Overview tab. */
function ProjectOverviewRedirect() {
  const { ws = '', projectKey = '' } = useParams()
  return <Navigate to={paths.project(ws, projectKey)} replace />
}

/** A project tab; old board/backlog links (and unknown tabs) are sent to the tab they now live on. */
function ProjectTabRoute() {
  const { ws = '', projectKey = '', tab = '' } = useParams()
  const { pathname } = useLocation()
  if ((projectTabs as readonly string[]).includes(tab)) return <ProjectPage />
  return <Navigate to={legacyProjectPath(pathname) ?? paths.project(ws, projectKey)} replace />
}

/** The Flow chat primitives gallery: dev server and prototype builds only (production drops the code). */
function devRoutes() {
  if (import.meta.env.MODE === 'production') return []
  const UiGallery = page(() => import('@/pages/dev/UiGallery'), 'UiGallery')
  return [
    {
      path: '/dev/ui',
      element: (
        <Suspense>
          <UiGallery />
        </Suspense>
      ),
    },
  ]
}

/** The pages inside a workspace (`/w/:ws/...`); `lib/pageHelp.test.ts` checks each has help or says why not. */
export const workspacePages: RouteObject[] = [
  // My work (UX Phase 2, 2.1): the workspace's own page; old My tasks links open it.
  { index: true, element: <MyWorkPage /> },
  // A pane: the channel fills the main card and scrolls its own message list (spec 5.3).
  { path: 'c/:channelId', element: <ChannelPage />, handle: { pane: true } },
  { path: 'activity', element: <ActivityPage />, handle: { pane: true } },
  { path: 'threads', element: <ThreadsPage />, handle: { pane: true } },
  { path: 'search', element: <SearchPage />, handle: { pane: true } },
  { path: 'preferences', element: <PreferencesPage /> },
  { path: 'saved', element: <SavedPage />, handle: { pane: true } },
  { path: 'drafts', element: <DraftsPage />, handle: { pane: true } },
  { path: 'projects', element: <ProjectsPage /> },
  { path: 'tasks', element: <MyTasksRedirect /> },
  { path: 'dashboard', element: <DashboardPage /> },
  { path: 'time', element: <TimeCostPage /> },
  { path: 'teams', element: <TeamsPage /> },
  { path: 'p/:projectKey', element: <ProjectOverviewRedirect /> },
  // The Chat tab fills the card instead of scrolling (UX Phase 1, 1.3).
  { path: 'p/:projectKey/:tab', element: <ProjectTabRoute />, handle: { fill: (params: { tab?: string }) => params.tab === 'chat' } },
  { path: 'settings', element: <SettingsPage /> },
  { path: 'settings/database', element: <DatabasePage /> },
  { path: 'settings/rates', element: <RatesPage /> },
  { path: 'settings/users', element: <UsersPage /> },
  { path: 'settings/roles', element: <RolesPage /> },
  { path: 'settings/audit', element: <AuditLogPage /> },
  { path: 'settings/archived', element: <ArchivedPage /> },
  { path: 'settings/attendance', element: <AttendancePage /> },
  { path: 'help', element: <HelpPage /> },
  { path: 'help/:chapter', element: <HelpPage /> },
]

export const router = createBrowserRouter([
  ...devRoutes(),
  // Sign in (slice AB): outside the shell, which needs someone signed in.
  {
    path: '/signin',
    element: (
      <Suspense>
        <SignInPage />
      </Suspense>
    ),
  },
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <LastVisitRedirect /> },
      {
        path: '/w/:ws',
        element: <WorkspaceGate />,
        children: workspacePages,
      },
      // Old or mistyped links say so, with the way back to the Dashboard.
      { path: '*', element: <NotFound what="page" backTo="/" backLabel="Back to Dashboard" /> },
    ],
  },
])
