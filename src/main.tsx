import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The DOM provider wires ReactDOM.flushSync, so a search box bound to the address keeps its caret (UX Phase 2).
import { RouterProvider } from 'react-router/dom'
import { LoadingBar } from '@/components/ui/LoadingBar'
import '@/index.css'
import { createQueryClient } from '@/lib/queryClient'
import { ThemeProvider } from '@/lib/ThemeProvider'
import { router } from '@/router'

const queryClient = createQueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LoadingBar />
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
