import { useQuery } from '@tanstack/react-query'
import { useInTeam } from './useTeam'
import clsx from 'clsx'
import { CircleDashed } from 'lucide-react'
import { Link } from 'react-router'
import { Card, CardHeader } from '../../components/ui/Card'
import { useMarket } from '../../lib/useMarket'
import { useViewer } from '../../lib/useRole'
import { followUpsApi, type FollowUp } from '../../api/followUps'
import { LastUpdateLine, NextStepView } from '../followUps/shared'
import { Avatar } from '../leads/shared'

const linkTo = (item: FollowUp) => (item.kind === 'Lead' ? `/leads/${item.id}` : `/opportunities/${item.id}`)

/** The salesperson's day: next steps due today, and anything overdue, across leads and deals. */
export function MyDayCard({ className }: { className?: string }) {
  const viewer = useViewer()
  const { scope } = useMarket()
  const { data: items } = useQuery({ queryKey: ['follow-ups', 'my-day', viewer.name, scope], queryFn: () => followUpsApi.myDay(viewer, scope) })
  return (
    <Card className={className}>
      <CardHeader
        title="Today and overdue"
        action={
          <span className="flex items-center gap-3 text-xs text-fg-muted">
            {items?.length ?? '–'} next steps
            {/* Opens today's list, not the month. */}
            <Link to="/activities?view=week" className="text-sm font-medium text-accent hover:text-accent-strong">
              Calendar
            </Link>
          </span>
        }
      />
      {items && items.length === 0 ? (
        <p className="px-5 py-6 text-sm text-fg-muted">Nothing due today.</p>
      ) : (
        <ul className="max-h-96 divide-y divide-line-subtle overflow-y-auto">
          {items?.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <Link to={linkTo(item)} className="flex items-center gap-4 px-5 py-3 hover:bg-surface-sunken">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{item.name}</p>
                  <p className="truncate text-xs text-fg-muted">
                    {item.kind} · {item.stage}
                  </p>
                </div>
                <div className="w-48 shrink-0">
                  <NextStepView step={item.next} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** Leads and deals being worked with no next step, quietest first, each with where it stands. */
export function NoNextStepCard({ className }: { className?: string }) {
  const viewer = useViewer()
  const { scope } = useMarket()
  const inTeam = useInTeam()
  const { data: all } = useQuery({ queryKey: ['follow-ups', 'no-next-step', viewer.role, viewer.name, scope], queryFn: () => followUpsApi.withoutNextStep(viewer, scope) })
  const items = all?.filter((item) => inTeam(item.repId))
  if (!items?.length) return null
  return (
    <Card className={clsx('border-amber-300 dark:border-amber-500/40', className)}>
      <CardHeader
        title="No next step"
        action={
          <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
            <CircleDashed className="size-3.5" /> {items.length}
          </span>
        }
      />
      <p className="px-5 pt-3 text-xs text-fg-muted">Plan what comes next so they don't fall through. The line under each shows where it stands.</p>
      <ul className="mt-1 max-h-96 divide-y divide-line-subtle overflow-y-auto">
        {items.slice(0, 30).map((item) => (
          <li key={`${item.kind}-${item.id}`}>
            <Link to={linkTo(item)} className="block px-5 py-3 hover:bg-surface-sunken">
              <p className="flex items-center justify-between gap-3">
                <span className="truncate text-sm font-medium text-fg">{item.name}</span>
                <span className="shrink-0 text-xs text-fg-muted">
                  {item.kind} · {item.stage}
                  {viewer.role !== 'Salesperson' && item.repName ? ` · ${item.repName}` : ''}
                </span>
              </p>
              <LastUpdateLine event={item.lastUpdate} className="mt-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Managers: per salesperson, overdue next steps and records with none. Each number opens that list. */
export function FollowUpsBySalespersonCard({ className }: { className?: string }) {
  const viewer = useViewer()
  const { scope } = useMarket()
  const inTeam = useInTeam()
  const { data: all } = useQuery({ queryKey: ['follow-ups', 'by-salesperson', viewer.role, viewer.name, scope], queryFn: () => followUpsApi.bySalesperson(viewer, scope) })
  const rows = all?.filter((row) => inTeam(row.repId))
  const count = (value: number, tone: string, to: string) =>
    value ? (
      <Link to={to} className={clsx('font-semibold tabular-nums hover:underline', tone)}>
        {value}
      </Link>
    ) : (
      <span className="tabular-nums text-fg-subtle">0</span>
    )
  return (
    <Card className={className}>
      <CardHeader
        title="Follow-ups by salesperson"
        action={
          <Link to="/activities" className="text-sm font-medium text-accent hover:text-accent-strong">
            Calendar
          </Link>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-subtle text-left text-xs text-fg-muted">
              <th className="px-5 py-2 font-medium">Salesperson</th>
              <th className="px-3 py-2 text-right font-medium">Being worked</th>
              <th className="px-3 py-2 text-right font-medium">Overdue</th>
              <th className="px-5 py-2 text-right font-medium">No next step</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-subtle">
            {rows?.map((row) => (
              <tr key={row.repId}>
                <td className="px-5 py-2.5">
                  <span className="flex items-center gap-2 text-fg">
                    <Avatar name={row.repName} size="sm" /> {row.repName}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-fg-secondary">{row.open}</td>
                <td className="px-3 py-2.5 text-right">{count(row.overdue, 'text-red-600 dark:text-red-400', `/leads?rep=${row.repId}&flag=overdue`)}</td>
                <td className="px-5 py-2.5 text-right">{count(row.noNext, 'text-amber-700 dark:text-amber-300', `/leads?rep=${row.repId}&flag=nonext`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 py-3 text-xs text-fg-muted">Counts cover leads and opportunities. Numbers open the salesperson's leads list.</p>
    </Card>
  )
}
