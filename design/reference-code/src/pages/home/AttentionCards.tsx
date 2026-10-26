// Home cards for what needs doing now: the attention list and the money owed on won deals.
import clsx from 'clsx'
import { AlarmClock, CalendarClock, ChevronRight, Hourglass, Repeat } from 'lucide-react'
import { Link } from 'react-router'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Card, CardHeader } from '../../components/ui/Card'
import { formatCompact } from '../../lib/format'
import type { AttentionKind, Dashboard } from '../../mocks/dashboard'

const tone: Record<AttentionKind, BadgeTone> = {
  'Overdue payment': 'danger',
  'Stuck deal': 'warning',
  'Late first contact': 'danger',
  'No salesperson yet': 'info',
}

/** Where the full list of each kind lives. */
const listFor: Record<AttentionKind, string> = {
  'Overdue payment': '/payments?tab=overdue',
  'Stuck deal': '/reports/stages',
  'Late first contact': '/leads?flag=sla',
  'No salesperson yet': '/leads?tab=unassigned',
}

/** Overdue payments, stuck deals, late first contacts and leads with no salesperson: a few of each, worst first. */
export function NeedsAttentionCard({ data, className }: { data: Dashboard; className?: string }) {
  const counts = (Object.entries(data.attentionCounts) as [AttentionKind, number][]).filter(([, count]) => count > 0)
  const total = counts.reduce((sum, [, count]) => sum + count, 0)
  return (
    <Card className={clsx('flex flex-col', className)}>
      <CardHeader title={total ? `Needs attention · ${total}` : 'Needs attention'} />
      {total === 0 ? (
        <p className="px-5 py-4 text-sm text-fg-muted">Nothing late. Stuck deals, late first contacts and overdue payments show here.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 px-5 pt-3">
            {counts.map(([kind, count]) => (
              <Link key={kind} to={listFor[kind]} className="rounded-full transition-opacity hover:opacity-80">
                <Badge tone={tone[kind]}>
                  {count} {count === 1 ? kind.toLowerCase() : plural(kind)}
                </Badge>
              </Link>
            ))}
          </div>
          <ul className="mt-2 divide-y divide-line-subtle">
            {data.attention.map((item) => (
              <li key={item.id}>
                <Link to={item.link} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-sunken">
                  <div className="hidden w-40 shrink-0 sm:block">
                    <Badge tone={tone[item.kind]}>{item.kind}</Badge>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{item.title}</p>
                    <p className="truncate text-xs text-fg-muted">
                      <span className="sm:hidden">{item.kind} · </span>
                      {item.detail}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-fg-muted">{item.age === 'today' ? 'Today' : `${item.age} late`}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

const plural = (kind: AttentionKind) =>
  ({ 'Overdue payment': 'overdue payments', 'Stuck deal': 'stuck deals', 'Late first contact': 'late first contacts', 'No salesperson yet': 'with no salesperson yet' })[kind]

/** Money still owed on won deals, and renewals coming up. Collections are what targets count. */
export function MoneyDueCard({ data, className, title = 'Money to collect' }: { data: Dashboard; className?: string; title?: string }) {
  const { moneyDue: due, currency } = data
  const rows = [
    { icon: AlarmClock, label: 'Overdue', amount: due.overdue, note: `${due.overdueCount} ${due.overdueCount === 1 ? 'payment' : 'payments'}`, to: '/payments?tab=overdue', alert: due.overdue > 0 },
    { icon: CalendarClock, label: 'Due in 30 days', amount: due.soon, note: `${due.soonCount} ${due.soonCount === 1 ? 'payment' : 'payments'}`, to: '/payments?tab=soon' },
    { icon: Hourglass, label: 'When projects finish', amount: due.waiting, note: 'Due on delivery', to: '/reports/uncollected' },
    { icon: Repeat, label: 'Renewals in 30 days', amount: due.renewals, note: `${due.renewalsCount} ${due.renewalsCount === 1 ? 'service' : 'services'}`, to: '/recurring-services?tab=renewals' },
  ]
  return (
    <Card className={className}>
      <CardHeader
        title={title}
        action={
          <Link to="/reports/uncollected" className="inline-flex items-center text-xs font-medium text-fg-muted transition-colors hover:text-accent">
            Report
            <ChevronRight className="size-3.5" />
          </Link>
        }
      />
      <ul className="divide-y divide-line-subtle">
        {rows.map((row) => (
          <li key={row.label}>
            <Link to={row.to} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-sunken">
              <span className={clsx('rounded-lg bg-surface-muted p-2', row.alert ? 'text-red-600 dark:text-red-400' : 'text-accent')}>
                <row.icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg-secondary">{row.label}</span>
                <span className="block truncate text-xs text-fg-muted">{row.note}</span>
              </span>
              <span className={clsx('shrink-0 text-sm font-semibold tabular-nums', row.alert ? 'text-red-600 dark:text-red-400' : 'text-fg')}>{row.amount ? formatCompact(row.amount, currency) : '0'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
