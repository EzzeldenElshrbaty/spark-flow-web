import { lazy, type ComponentType } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { AppLayout } from './layout/AppLayout'
import { settingsItem } from './navigation'
import { PlaceholderPage } from './pages/PlaceholderPage'

/**
 * A page whose code downloads the first time it's opened, so the first visit only loads what it shows.
 * AppLayout's Suspense covers the moment it takes.
 */
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return lazy(() => load().then((module) => ({ default: module[name] })))
}

const HomePage = page(() => import('./pages/HomePage'), 'HomePage')

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: settingsItem.path, element: <PlaceholderPage item={settingsItem} /> },
      // Old or mistyped links go Home.
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
