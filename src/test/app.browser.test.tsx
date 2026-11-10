import '@/index.css'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { appRoutes } from '@/router'
import { renderApp } from './app'

// UX Phase 6, 6.1: the whole app in the browser project, as a chosen person, theme and size, so the audit's checks
// can run on every page.

function Boom() {
  console.error('boom')
  return <h1>Boom</h1>
}

describe('renderApp', () => {
  it('opens a page as the chosen person, in the chosen theme and size', async () => {
    const app = await renderApp({ path: '/w/engineering/projects', as: 'member', theme: 'dark', size: 'phone' })
    await app.settled()
    expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeTruthy()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(innerWidth).toBe(390)
    expect(screen.getByRole('button', { name: 'Mariam Fathy Frontend Engineer' })).toBeTruthy()
  })

  it('starts each load from clean storage', async () => {
    const admin = await renderApp({ path: '/w/engineering', as: 'admin', theme: 'light', size: 'desktop' })
    await admin.settled()
    expect(screen.getByRole('button', { name: 'Youssef Abdelrahman Managing Director' })).toBeTruthy()
    const member = await renderApp({ path: '/w/engineering', as: 'member', theme: 'light', size: 'desktop' })
    await member.settled()
    expect(screen.getByRole('button', { name: 'Mariam Fathy Frontend Engineer' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Youssef Abdelrahman Managing Director' })).toBeNull()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('collects console errors', async () => {
    const routes = [{ path: '/boom', element: <Boom /> }, ...appRoutes]
    const app = await renderApp({ path: '/boom', as: 'admin', theme: 'light', size: 'desktop', routes })
    await app.settled()
    expect(app.consoleErrors.some((line) => line.includes('boom'))).toBe(true)
  })

  it('settles on a page that polls', async () => {
    const app = await renderApp({ path: '/w/engineering/dashboard', as: 'admin', theme: 'light', size: 'laptop' })
    await app.settled()
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy()
    expect([innerWidth, innerHeight]).toEqual([1280, 720])
  })

  it('signed out opens Sign in', async () => {
    const app = await renderApp({ path: '/w/engineering/dashboard', as: null, theme: 'light', size: 'tablet' })
    await app.settled()
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeTruthy()
    expect(app.router.state.location.pathname).toBe('/signin')
  })
})
