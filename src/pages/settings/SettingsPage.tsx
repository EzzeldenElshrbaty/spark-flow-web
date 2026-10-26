import { ChevronRight, Database, Wallet } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { backendOn } from '@/lib/api'
import { paths } from '@/lib/paths'
import { usePermission } from '@/lib/usePermission'

export function SettingsPage() {
  const { ws = '' } = useParams()
  const can = usePermission()
  const showRates = can('rates.view')
  const showDatabase = !backendOn && can('database.manage')

  return (
    <>
      <PageHeader title="Settings" subtitle="Demo data and preferences." />
      {!showRates && !showDatabase && <p className="text-sm text-fg-muted">Nothing to set up here yet.</p>}
      {(showRates || showDatabase) && (
        <Card className="max-w-2xl divide-y divide-line-subtle">
          {showRates && (
            <Link to={paths.rates(ws)} className="flex items-center gap-3 rounded-xl px-5 py-4 hover:bg-surface-sunken">
              <Wallet className="size-5 text-fg-tertiary" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-fg">Hourly cost</span>
                <span className="block text-sm text-fg-muted">What each person costs per hour, for project cost. Admin only.</span>
              </span>
              <ChevronRight className="size-4 text-fg-muted rtl:-scale-x-100" />
            </Link>
          )}
          {/* The demo data only exists in the prototype; with the backend on there is no Database page. */}
          {showDatabase && (
            <Link to={paths.database(ws)} className="flex items-center gap-3 rounded-xl px-5 py-4 hover:bg-surface-sunken">
              <Database className="size-5 text-fg-tertiary" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-fg">Database</span>
                <span className="block text-sm text-fg-muted">Export, reload seed data or reset the demo data in this browser.</span>
              </span>
              <ChevronRight className="size-4 text-fg-muted rtl:-scale-x-100" />
            </Link>
          )}
        </Card>
      )}
    </>
  )
}
