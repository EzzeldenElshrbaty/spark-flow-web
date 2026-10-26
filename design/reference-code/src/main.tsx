import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LoadingBar } from './components/ui/LoadingBar'
import { RouterProvider } from 'react-router'
import '/index.css'
import { AuthProvider } from '/lib/AuthProvider'
import { MarketProvider } from '/lib/MarketProvider'
import { RoleProvider } from '/lib/RoleProvider'
import { ThemeProvider } from '/lib/ThemeProvider'
import { router } from './router'

// After any change, everything on screen reloads (counts, tabs, the bell), so nothing needs a page refresh. A change
// waits for that reload before it counts as done, unless it's marked `closeFirst` (uploads: the files are saved, so
// the dialog closes and the page catches up behind it).
const queryClient: QueryClient = new QueryClient({
  // Data loaded in the last 30 seconds is shown as it is when a page or tab opens again, instead of loading it again.
  // A change still reloads everything on screen straight away (below).
  defaultOptions: { queries: { staleTime: 30_000 } },
  mutationCache: new MutationCache({
    onSuccess: (_data, _variables, _context, mutation) => {
      const reload = queryClient.invalidateQueries()
      return mutation.meta?.closeFirst ? undefined : reload
    },
  }),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LoadingBar />
      <ThemeProvider>
        <AuthProvider>
          <RoleProvider>
            <MarketProvider>
              <RouterProvider router={router} />
            </MarketProvider>
          </RoleProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
