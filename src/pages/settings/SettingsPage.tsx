import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { useResetDemo } from '@/api/db'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { backendOn } from '@/lib/api'
import { useUiStore } from '@/lib/uiStore'

export function SettingsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const reset = useResetDemo()
  const forgetPlaces = useUiStore((state) => state.forgetPlaces)

  const resetDemo = () =>
    reset.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear() // everything on screen was the old sample data
        forgetPlaces() // the places last visited may be gone, so start again from #general
        navigate('/')
      },
    })

  return (
    <>
      <PageHeader title="Settings" subtitle="Demo data and preferences." />
      {/* The demo data only exists in the prototype; with the backend on there is nothing to reset. */}
      {!backendOn && (
        <Card className="max-w-2xl">
          <CardHeader title="Demo data" />
          <div className="px-5 py-4">
            <p className="text-sm text-fg-secondary">Puts back the sample workspaces, channels, messages and tickets. Your changes in this browser are removed.</p>
            <Button variant="secondary" className="mt-4" onClick={resetDemo} disabled={reset.isPending}>
              {reset.isPending ? 'Resetting…' : 'Reset demo data'}
            </Button>
            {reset.isError && (
              <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
                Demo data didn't reset. Try again.
              </p>
            )}
          </div>
        </Card>
      )}
    </>
  )
}
