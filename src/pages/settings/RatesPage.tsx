import { ArrowLeft } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useRates, useUpdateRate } from '@/api/rates'
import { formatDate } from '@/lib/format'
import { currentRates } from '@/lib/rates'
import type { User } from '@/api/types'
import { useUsers } from '@/api/users'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { inputClass } from '@/components/ui/Field'
import { LeaveGuard } from '@/components/ui/LeaveGuard'
import { NoAccess } from '@/components/ui/NoAccess'
import { PageHeader } from '@/components/ui/PageHeader'
import { QueryError } from '@/components/ui/QueryError'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { paths } from '@/lib/paths'
import { useAccess } from '@/lib/usePermission'

/** What a migrated rate starts from: it has always been in effect. */
const START_OF_TIME = '1970-01-01T00:00:00.000Z'

function RateRow({
  person,
  saved,
  since,
  justSaved,
  onChanged,
  onSaved,
}: {
  person: User
  saved: number | undefined
  since: string | undefined
  /** Saved a moment ago: the row says so until it changes again (UX Phase 4, 4.10). */
  justSaved: boolean
  /** Whether this row holds a cost not saved yet, so leaving the page asks first (UX Phase 1, 1.2). */
  onChanged: (changed: boolean) => void
  onSaved: () => void
}) {
  const update = useUpdateRate()
  const [value, setValue] = useState(saved === undefined ? '' : String(saved))
  const changed = value !== (saved === undefined ? '' : String(saved))
  const onChangedRef = useRef(onChanged)
  useEffect(() => {
    onChangedRef.current = onChanged
  })
  useEffect(() => {
    if (!changed) return
    onChangedRef.current(true)
    return () => onChangedRef.current(false)
  }, [changed])
  const number = Number(value)
  const invalid = value.trim() === '' || !Number.isFinite(number) || number < 0
  const save = () => {
    if (changed && !invalid && !update.isPending) update.mutate({ userId: person.id, hourlyCost: number }, { onSuccess: onSaved })
  }
  return (
    <li className="py-3">
      {/* Enter in the cost saves it, as Save does. */}
      <form
        className="flex items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Avatar name={person.name} size={24} decorative />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-fg">{person.name}</span>
          <span className="block truncate text-xs text-fg-muted">
            {person.title}
            {since && since !== START_OF_TIME && ` · Since ${formatDate(since)}`}
          </span>
        </span>
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <span className="sr-only">Hourly cost for {person.name}</span>
          EGP
          <input
            type="number"
            min={0}
            step={10}
            inputMode="decimal"
            className={`${inputClass} w-28 text-end tabular-nums`}
            value={value}
            aria-invalid={changed && invalid}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        {changed ? (
          <Button type="submit" variant="ghost" disabled={invalid || update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        ) : (
          justSaved && (
            <span role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
              Saved.
            </span>
          )
        )}
      </form>
      {changed && invalid && <p className="mt-1 text-end text-xs text-red-600 dark:text-red-400">Hourly cost is 0 or more.</p>}
      {update.error && <p className="mt-1 text-end text-xs text-red-600 dark:text-red-400">{(update.error as Error).message}</p>}
    </li>
  )
}

/** Settings → Hourly cost: what each person costs per hour, for project cost. Admin only. */
export function RatesPage() {
  const { ws = '' } = useParams()
  const { workspace } = useCurrentWorkspace()
  const access = useAccess('rates.view')
  const rates = useRates(access === 'allowed')
  const people = useUsers(workspace?.id)
  // Rows with a cost not saved yet (UX Phase 1, 1.2).
  const [changedRows, setChangedRows] = useState<ReadonlySet<string>>(new Set())
  // The row saved last says "Saved." until it changes again; a row starts afresh after a save (its key).
  const [savedRow, setSavedRow] = useState<string | null>(null)
  const markChanged = (userId: string, on: boolean) => {
    setChangedRows((all) => {
      const next = new Set(all)
      if (on) next.add(userId)
      else next.delete(userId)
      return next
    })
    if (on) setSavedRow((row) => (row === userId ? null : row))
  }

  const back = (
    <Link to={paths.settings(ws)} className="mb-3 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
      <ArrowLeft className="size-4 rtl:-scale-x-100" /> Settings
    </Link>
  )
  const header = <PageHeader title="Hourly cost" subtitle="EGP per hour. Used for project cost; only Admins see it." />

  if (access === 'denied') {
    return (
      <>
        {back}
        <PageHeader title="Hourly cost" />
        <NoAccess ws={ws} what="hourly costs" />
      </>
    )
  }

  let body
  if (rates.isError) body = <QueryError what="Hourly costs" onRetry={() => void rates.refetch()} />
  else if (people.isError) body = <QueryError what="People" onRetry={() => void people.refetch()} />
  else if (access === 'loading' || rates.isPending || people.isPending) body = <div className="h-96 max-w-2xl animate-pulse rounded-xl bg-surface-strong" aria-busy="true" />
  else
    body = (
      <Card className="max-w-2xl">
        <ul className="divide-y divide-line-subtle px-5">
          {people.data.map((person) => {
            // The rate now; earlier rows stay, so past time keeps the cost it had.
            const current = currentRates(rates.data).find((r) => r.userId === person.id)
            const saved = current?.hourlyCost
            // The key carries the saved value, so a row resets to it after a save.
            return (
              <RateRow
                key={`${person.id}:${saved ?? ''}`}
                person={person}
                saved={saved}
                since={current?.effectiveFrom}
                justSaved={savedRow === person.id}
                onChanged={(on) => markChanged(person.id, on)}
                onSaved={() => setSavedRow(person.id)}
              />
            )
          })}
        </ul>
      </Card>
    )

  return (
    <>
      {back}
      {header}
      {body}
      <LeaveGuard dirty={changedRows.size > 0} description="Hourly costs you changed aren’t saved." />
    </>
  )
}
