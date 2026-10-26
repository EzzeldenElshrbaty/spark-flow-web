import { lazy, type ComponentType } from 'react'
import { createBrowserRouter, Navigate, useParams } from 'react-router'
import { AppLayout } from '@/layout/AppLayout'
import { LastVisitRedirect } from '@/layout/LastVisitRedirect'
import { WorkspaceGate } from '@/layout/WorkspaceGate'
import { paths } from '@/lib/paths'

/**
 * A page whose code downloads the first time it's opened, so the first visit only loads what it shows.
 * AppLayout's Suspense covers the moment it takes.
 */
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((module) => ({ default: module[name] })))
}

const ChannelPage = page(() => import('@/pages/chat/ChannelPage'), 'ChannelPage')
const ProjectPage = page(() => import('@/pages/projects/ProjectPage'), 'ProjectPage')
const SettingsPage = page(() => import('@/pages/settings/SettingsPage'), 'SettingsPage')

/** `/w/:ws/p/:projectKey` has no page of its own: it opens the board. */
function ProjectBoardRedirect() {
  const { ws = '', projectKey = '' } = useParams()
  return <Navigate to={paths.project(ws, projectKey)} replace />
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
          { index: true, element: <LastVisitRedirect /> },
          { path: 'c/:channelId', element: <ChannelPage /> },
          { path: 'p/:projectKey', element: <ProjectBoardRedirect /> },
          { path: 'p/:projectKey/:view', element: <ProjectPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
      // Old or mistyped links go to where you were last.
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
