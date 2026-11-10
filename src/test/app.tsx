import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { cleanup, render } from '@testing-library/react'
import { StrictMode } from 'react'
import { createMemoryRouter, type RouteObject } from 'react-router'
// The DOM provider, as main.tsx uses (it wires ReactDOM.flushSync for boxes bound to the address).
import { RouterProvider } from 'react-router/dom'
import { onTestFinished } from 'vitest'
import { page } from 'vitest/browser'
import { LoadingBar } from '@/components/ui/LoadingBar'
import { latency } from '@/mocks/latency'
import { createQueryClient } from '@/lib/queryClient'
import { ThemeProvider } from '@/lib/ThemeProvider'
import { appRoutes } from '@/router'
import { ROLE_USER, SIZE, type Role, type Size, type Theme } from './setups'

/**
 * The whole app in the browser project (UX Phase 6, 6.1): the real routes in a memory router, the real query client
 * and the mock backend with no fake network time, as a chosen person, theme and screen size. The page checks, the
 * sheet and dialog keyboard tests and the role walkthroughs all start here.
 */

export { ROLE_USER, SIZE, type Role, type Size, type Theme } from './setups'

export type AppHandle = {
  router: ReturnType<typeof createMemoryRouter>
  queryClient: QueryClient
  /** Everything said through console.error, error events and unhandled rejections since the render. */
  consoleErrors: string[]
  /** Resolves once the page has settled (see below); rejects after 10 s naming what it still waits for. */
  settled: () => Promise<void>
}

const SETTLE_MS = 10_000

const text = (value: unknown) => (value instanceof Error ? `${value.name}: ${value.message}` : String(value))

/** What the page still waits for, or null once it has settled. */
function waitingFor(queryClient: QueryClient): string | null {
  if (!document.querySelector('h1')?.textContent?.trim()) return 'an h1'
  const fetching = queryClient.isFetching() + queryClient.isMutating()
  if (fetching) return `${fetching} request(s)`
  if (document.querySelector('[aria-busy="true"]')) return 'a skeleton ([aria-busy])'
  return null
}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

export async function renderApp(opts: { path: string; as: Role | null; theme: Theme; size: Size; routes?: RouteObject[] }): Promise<AppHandle> {
  cleanup()
  latency.min = 0
  latency.max = 0
  // Nothing from the last load (last places, recent timers, View as) changes this one.
  localStorage.clear()
  sessionStorage.clear()
  if (opts.as) localStorage.setItem('spark-flow.session', ROLE_USER[opts.as].id)
  localStorage.setItem('spark-flow.theme', opts.theme)
  document.documentElement.classList.toggle('dark', opts.theme === 'dark')
  const [width, height] = SIZE[opts.size]
  await page.viewport(width, height)

  const consoleErrors: string[] = []
  const original = console.error
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args.map(text).join(' '))
    original(...args)
  }
  const onError = (event: ErrorEvent) => consoleErrors.push(text(event.error ?? event.message))
  const onRejection = (event: PromiseRejectionEvent) => consoleErrors.push(text(event.reason))
  addEventListener('error', onError)
  addEventListener('unhandledrejection', onRejection)
  onTestFinished(() => {
    console.error = original
    removeEventListener('error', onError)
    removeEventListener('unhandledrejection', onRejection)
    cleanup()
  })

  const queryClient = createQueryClient()
  const router = createMemoryRouter(opts.routes ?? appRoutes, { initialEntries: [opts.path] })
  render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <LoadingBar />
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </QueryClientProvider>
    </StrictMode>,
  )

  const settled = async () => {
    const until = performance.now() + SETTLE_MS
    let waiting = waitingFor(queryClient)
    while (waiting) {
      if (performance.now() > until) throw new Error(`The page didn’t settle at ${router.state.location.pathname}: still waiting for ${waiting}.`)
      await new Promise((resolve) => setTimeout(resolve, 50))
      waiting = waitingFor(queryClient)
    }
    // Fades and slides finish first, so contrast is measured on the final colours; endless ones (a pulsing dot) don't count.
    const finite = document.getAnimations().filter((a) => Number.isFinite(a.effect?.getTiming().iterations ?? 1))
    await Promise.all(finite.map((a) => a.finished.catch(() => undefined)))
    await frame()
    await frame()
  }
  return { router, queryClient, consoleErrors, settled }
}
