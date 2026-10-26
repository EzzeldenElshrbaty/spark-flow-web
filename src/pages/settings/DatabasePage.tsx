import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useExportData, useReloadSeed, useResetDemo } from '@/api/db'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { DeleteDialog } from '@/components/ui/DeleteDialog'
import { PageHeader } from '@/components/ui/PageHeader'
import { backendOn } from '@/lib/api'
import { paths } from '@/lib/paths'
import { useUiStore } from '@/lib/uiStore'
import { usePermission } from '@/lib/usePermission'

const errorText = 'mt-3 text-sm text-red-600 dark:text-red-400'

function Section({ title, about, children }: { title: string; about: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} />
      <div className="px-5 py-4">
        <p className="text-sm text-fg-secondary">{about}</p>
        {children}
      </div>
    </Card>
  )
}

/** Saves the export as a .json file through a blob: link. The link is freed a moment later: some browsers cancel the download if it goes at once. */
function download(json: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `spark-flow-export-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** The demo's data in this browser: export it, reload the sample company, or wipe it. Admins only (spec §4.3). */
export function DatabasePage() {
  const { ws = '' } = useParams()
  const allowed = usePermission()('database.manage')
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const forgetPlaces = useUiStore((state) => state.forgetPlaces)
  const exportData = useExportData()
  const reloadSeed = useReloadSeed()
  const reset = useResetDemo()
  const [confirming, setConfirming] = useState(false)

  // Everything on screen was the old data, and the places last visited may be gone.
  const startOver = () => {
    queryClient.clear()
    forgetPlaces()
    navigate('/')
  }

  const back = (
    <Link to={paths.settings(ws)} className="mb-3 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
      <ArrowLeft className="size-4 rtl:-scale-x-100" /> Settings
    </Link>
  )

  if (backendOn || !allowed) {
    return (
      <>
        {back}
        <PageHeader title="Database" />
        <p className="text-sm text-fg-secondary">
          You don't have access to the database.{' '}
          <Link to={paths.workspace(ws)} className="font-medium text-accent hover:text-accent-strong">
            Go to Home
          </Link>
        </p>
      </>
    )
  }

  return (
    <>
      {back}
      <PageHeader title="Database" subtitle="Demo data in this browser." />
      <div className="grid max-w-2xl gap-4">
        <Section title="Export data" about="Downloads every record as one JSON file.">
          <Button variant="secondary" className="mt-4" disabled={exportData.isPending} onClick={() => exportData.mutate(undefined, { onSuccess: download })}>
            {exportData.isPending ? 'Exporting…' : 'Export data'}
          </Button>
          {exportData.isError && <p role="alert" className={errorText}>The export didn't work. Try again.</p>}
        </Section>

        <Section title="Reload seed data" about="Replaces everything with the sample company.">
          <Button variant="secondary" className="mt-4" disabled={reloadSeed.isPending} onClick={() => reloadSeed.mutate(undefined, { onSuccess: startOver })}>
            {reloadSeed.isPending ? 'Reloading…' : 'Reload seed data'}
          </Button>
          {reloadSeed.isError && <p role="alert" className={errorText}>The seed data didn't reload. Try again.</p>}
        </Section>

        <Section title="Reset" about="Deletes everything in this browser, then loads the sample company again.">
          <Button variant="danger" className="mt-4" onClick={() => setConfirming(true)}>
            Reset data
          </Button>
        </Section>
      </div>

      {confirming && (
        <DeleteDialog
          title="Reset data"
          description="Every project, task, message, time entry and file in this browser is deleted, then the sample company loads again."
          confirmText="reset"
          removes={['All records in this browser', 'Every uploaded file', 'Your saved places']}
          onDelete={async () => {
            await reset.mutateAsync()
            setConfirming(false)
            startOver()
          }}
          onClose={() => setConfirming(false)}
          actionLabel="Reset data"
          pendingLabel="Resetting…"
        />
      )}
    </>
  )
}
