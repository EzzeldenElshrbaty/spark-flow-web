import { lazy, type ComponentType } from 'react'
import { createBrowserRouter, Navigate, useLocation, useParams } from 'react-router'
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
const HomePage = page(() => import('@/pages/home/HomePage'), 'HomePage')
const DashboardPage = page(() => import('@/pages/dashboard/DashboardPage'), 'DashboardPage')
const TimeCostPage = page(() => import('@/pages/time/TimeCostPage'), 'TimeCostPage')
const TeamsPage = page(() => import('@/pages/teams/TeamsPage'), 'TeamsPage')
const ProjectsPage = page(() => import('@/pages/projects/ProjectsPage'), 'ProjectsPage')
const MyTasksPage = page(() => import('@/pages/tasks/MyTasksPage'), 'MyTasksPage')
const SettingsPage = page(() => import('@/pages/settings/SettingsPage'), 'SettingsPage')
const DatabasePage = page(() => import('@/pages/settings/DatabasePage'), 'DatabasePage')
const RatesPage = page(() => import('@/pages/settings/RatesPage'), 'RatesPage')

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

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <LastVisitRedirect /> },
      {
        path: '/w/:ws',
        element: <WorkspaceGate />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'c/:channelId', element: <ChannelPage /> },
          { path: 'projects', element: <ProjectsPage /> },
          { path: 'tasks', element: <MyTasksPage /> },
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'time', element: <TimeCostPage /> },
          { path: 'teams', element: <TeamsPage /> },
          { path: 'p/:projectKey', element: <ProjectOverviewRedirect /> },
          { path: 'p/:projectKey/:tab', element: <ProjectTabRoute /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'settings/database', element: <DatabasePage /> },
          { path: 'settings/rates', element: <RatesPage /> },
        ],
      },
      // Old or mistyped links go to where you were last.
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
