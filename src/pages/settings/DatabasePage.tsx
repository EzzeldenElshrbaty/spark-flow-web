import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useExportData, useImportData, useResetDemo } from '@/api/db'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { DeleteDialog } from '@/components/ui/DeleteDialog'
import { PageHeader } from '@/components/ui/PageHeader'
import { backendOn } from '@/lib/api'
import { paths } from '@/lib/paths'
import { useUiStore } from '@/lib/uiStore'
import { useAccess } from '@/lib/usePermission'

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
  const access = useAccess('database.manage')
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const forgetPlaces = useUiStore((state) => state.forgetPlaces)
  const exportData = useExportData()
  const importData = useImportData()
  const reset = useResetDemo()
  // Both replace this browser's data, so both ask the person to type a word first.
  const [confirming, setConfirming] = useState<'import' | 'reset' | null>(null)
  // The export picked for Import, read and parsed; a file that isn't JSON is said here, before any confirm.
  const [bundle, setBundle] = useState<unknown>(null)
  const [pickError, setPickError] = useState<string | null>(null)
  const pick = async (file: File | undefined) => {
    if (!file) return
    setPickError(null)
    try {
      setBundle(JSON.parse(await file.text()))
      setConfirming('import')
    } catch {
      setPickError("That file isn't a Spark Flow export.")
    }
  }

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

  if (!backendOn && access === 'loading') {
    return (
      <>
        {back}
        <PageHeader title="Database" subtitle="Demo data in this browser." />
        <div className="grid max-w-2xl gap-4" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-surface-strong" />
          ))}
        </div>
      </>
    )
  }

  if (backendOn || access === 'denied') {
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

        <Section title="Import data" about="Replaces every record with an export file (from Export data). Uploaded files are deleted. Files aren't in the export, so attached files won't open after an import.">
          <label className="mt-4 inline-flex cursor-pointer items-center rounded-lg bg-surface px-3 py-2 text-sm font-medium text-fg ring-1 ring-line hover:bg-surface-sunken">
            Import data
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(e) => {
                void pick(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
          {pickError && <p role="alert" className={errorText}>{pickError}</p>}
        </Section>

        <Section title="Reset" about="Deletes everything in this browser, then loads the sample company again.">
          <Button variant="danger" className="mt-4" onClick={() => setConfirming('reset')}>
            Reset data
          </Button>
        </Section>
      </div>

      {confirming === 'import' && (
        <DeleteDialog
          title="Import data"
          description="Every project, task, message and time entry in this browser is replaced by the file's."
          confirmText="import"
          removes={['All records in this browser', 'Every uploaded file', 'Your saved places']}
          onDelete={async () => {
            await importData.mutateAsync(bundle)
            setConfirming(null)
            startOver()
          }}
          onClose={() => setConfirming(null)}
          actionLabel="Import data"
          pendingLabel="Importing…"
        />
      )}

      {confirming === 'reset' && (
        <DeleteDialog
          title="Reset data"
          description="Every project, task, message, time entry and file in this browser is deleted, then the sample company loads again."
          confirmText="reset"
          removes={['All records in this browser', 'Every uploaded file', 'Your saved places']}
          onDelete={async () => {
            await reset.mutateAsync()
            setConfirming(null)
            startOver()
          }}
          onClose={() => setConfirming(null)}
          actionLabel="Reset data"
          pendingLabel="Resetting…"
        />
      )}
    </>
  )
}
