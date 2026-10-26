// Chart cards for the Home dashboards. Each takes the dashboard response and picks what it shows.
import clsx from 'clsx'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { BarList } from '../../components/charts/BarList'
import { ChartCard } from '../../components/charts/ChartCard'
import { chartColors, marketColor, stepColor } from '../../components/charts/chartUtils'
import { ColumnChart } from '../../components/charts/ColumnChart'
import { LineChart } from '../../components/charts/LineChart'
import { formatCompact, percent } from '../../lib/format'
import { useMarket } from '../../lib/useMarket'
import { MarketIcon } from '../../layout/MarketSwitcher'
import { dashboardPeriods, type Dashboard, type DashboardPeriod } from '../../mocks/dashboard'

type CardProps = { data: Dashboard; className?: string }

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const share = (part: number, whole: number) => `${percent(part, whole)}%`

/** "Report" link in a chart card's corner: the full report behind the chart. */
function ReportLink({ to }: { to: string }) {
  return (
    <Link to={to} className="inline-flex items-center text-xs font-medium text-fg-muted transition-colors hover:text-accent" title="Open the full report">
      Report
      <ChevronRight className="size-3.5" />
    </Link>
  )
}

/** Period switch on the left, the market the numbers are for on the right. */
export function PeriodBar({ period, onChange, currency }: { period: DashboardPeriod; onChange: (period: DashboardPeriod) => void; currency: string }) {
  const { scope, market } = useMarket()
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div role="radiogroup" aria-label="Period" className="inline-flex rounded-lg bg-surface-muted p-0.5 ring-1 ring-line">
        {dashboardPeriods.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={period === item.id}
            onClick={() => onChange(item.id)}
            className={clsx(
              'rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-brand-500 sm:px-3',
              period === item.id ? 'bg-surface text-fg shadow-sm ring-1 ring-line' : 'text-fg-muted hover:text-fg',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="flex min-w-0 items-center gap-2 text-xs text-fg-muted">
        <MarketIcon scope={scope} className="size-5 shrink-0" />
        <span className="hidden truncate sm:inline">{market?.name ?? 'All markets'} ·</span>
        <span className="shrink-0">
          {currency}
          {!market && <span className="hidden sm:inline"> (indicative)</span>}
        </span>
      </p>
    </div>
  )
}

export function ActivitiesCard({ data, className }: CardProps) {
  const series = [
    { key: 'meetings', label: 'Meetings', color: chartColors.primary },
    { key: 'other', label: 'Calls & messages', color: chartColors.context },
  ]
  const days = data.activitiesByDay
  const total = days.reduce((sum, day) => sum + day.meetings + day.other, 0)
  return (
    <ChartCard
      className={className}
      action={<ReportLink to="/reports/activities" />}
      title="Activities, last 14 days"
      subtitle={`${total} logged · ${days.reduce((sum, day) => sum + day.meetings, 0)} meetings`}
      legend={series.map(({ label, color }) => ({ label, color }))}
      table={{
        columns: ['Day', 'Meetings', 'Calls & messages'],
        rows: days.map((day) => [new Date(day.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), day.meetings, day.other]),
      }}
    >
      <ColumnChart
        label="Activities per day, last 14 days"
        series={series}
        columns={days.map((day, index) => ({
          label: index === days.length - 1 ? 'Today' : String(new Date(day.date).getDate()),
          title: new Date(day.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }),
          values: { meetings: day.meetings, other: day.other },
          highlight: index === days.length - 1,
        }))}
      />
    </ChartCard>
  )
}

export function PipelineCard({ data, className, title = 'Pipeline by stage' }: CardProps & { title?: string }) {
  const stages = data.pipelineByStage
  const total = stages.reduce((sum, stage) => sum + stage.value, 0)
  const money = (value: number) => formatCompact(value, data.currency)
  return (
    <ChartCard
      className={className}
      action={<ReportLink to="/reports/forecast" />}
      title={title}
      subtitle={`${money(total)} in ${stages.reduce((sum, stage) => sum + stage.deals, 0)} open deals`}
      table={{ columns: ['Stage', 'Deals', 'Value'], rows: stages.map((stage) => [stage.stage, stage.deals, money(stage.value)]) }}
    >
      <BarList
        rows={stages.map((stage, index) => ({
          label: stage.stage,
          value: stage.value,
          display: money(stage.value),
          note: `${stage.deals} ${stage.deals === 1 ? 'deal' : 'deals'}`,
          color: stepColor(index, stages.length),
          details: [
            { label: 'Value', value: money(stage.value) },
            { label: 'Deals', value: stage.deals },
            { label: 'Share of pipeline', value: share(stage.value, total) },
          ],
        }))}
      />
    </ChartCard>
  )
}

export function LeadsByStatusCard({ data, className }: CardProps) {
  const rows = data.leadsByStatus
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  return (
    <ChartCard
      className={className}
      action={<ReportLink to="/reports/funnel" />}
      title="My leads by status"
      subtitle={`${total} leads you got · ${data.period.label.toLowerCase()}`}
      table={{ columns: ['Status', 'Leads'], rows: rows.map((row) => [row.label, row.count]) }}
    >
      <BarList rows={rows.map((row) => ({ label: row.label, value: row.count, display: String(row.count), details: [{ label: 'Leads', value: row.count }, { label: 'Share', value: share(row.count, total) }] }))} />
    </ChartCard>
  )
}

export function SourcesCard({ data, className }: CardProps) {
  const rows = data.leadsByChannel
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  return (
    <ChartCard
      className={className}
      action={<ReportLink to="/reports/sources?group=channel" />}
      title="Where leads come from"
      subtitle={`${total} new leads by channel · ${data.period.label.toLowerCase()}`}
      table={{ columns: ['Channel', 'Leads', 'Share'], rows: rows.map((row) => [row.label, row.count, share(row.count, total)]) }}
    >
      <BarList rows={rows.map((row) => ({ label: row.label, value: row.count, display: String(row.count), details: [{ label: 'Leads', value: row.count }, { label: 'Share', value: share(row.count, total) }] }))} />
    </ChartCard>
  )
}

export function FunnelCard({ data, className }: CardProps) {
  const steps = data.funnel
  const first = steps[0]?.count ?? 0
  return (
    <ChartCard
      className={className}
      action={<ReportLink to="/reports/funnel" />}
      title="Lead conversion"
      subtitle={`${share(steps[steps.length - 1]?.count ?? 0, first)} of new leads became opportunities · ${data.period.label.toLowerCase()}`}
      table={{ columns: ['Step', 'Leads', 'Of new leads'], rows: steps.map((step) => [step.label, step.count, share(step.count, first)]) }}
    >
      <BarList
        max={first || 1}
        rows={steps.map((step, index) => ({
          label: step.label,
          value: step.count,
          display: String(step.count),
          note: index ? share(step.count, first) : undefined,
          color: stepColor(index, steps.length),
          details: [
            { label: 'Leads', value: step.count },
            { label: 'Of new leads', value: share(step.count, first) },
            // The second step's previous step is the new leads, already shown above.
            ...(index > 1 ? [{ label: `Of ${steps[index - 1].label.toLowerCase()}`, value: share(step.count, steps[index - 1].count) }] : []),
          ],
        }))}
      />
    </ChartCard>
  )
}

export function NewLeadsCard({ data, className }: CardProps) {
  const weeks = data.newLeadsByWeek
  const byMarket = data.markets.length > 1
  const series = byMarket
    ? data.markets.map((market) => ({ key: market.id, label: market.name, color: marketColor(market.id), values: weeks.map((week) => week.byMarket[market.id] ?? 0) }))
    : [{ key: 'total', label: 'New leads', color: chartColors.primary, values: weeks.map((week) => week.total), area: true }]
  return (
    <ChartCard
      className={className}
      action={<ReportLink to="/reports/funnel?group=market" />}
      title={byMarket ? 'New leads per week, by market' : 'New leads per week'}
      subtitle={`Last 8 weeks · ${weeks[weeks.length - 1]?.total ?? 0} this week`}
      legend={byMarket ? series.map((item) => ({ label: item.label, color: item.color, kind: 'line' as const })) : undefined}
      table={{
        columns: ['Week of', ...series.map((item) => item.label)],
        rows: weeks.map((week, index) => [shortDate(week.start), ...series.map((item) => item.values[index])]),
      }}
    >
      <LineChart label="New leads per week, last 8 weeks" labels={weeks.map((week) => shortDate(week.start))} titles={weeks.map((week) => `Week of ${shortDate(week.start)}`)} series={series} />
    </ChartCard>
  )
}

export function SalespeopleCard({ data, className }: CardProps) {
  const people = data.salespeople.map((person) => ({ ...person, achievedShare: percent(person.achieved, person.target) })).sort((a, b) => b.achievedShare - a.achievedShare)
  const showMarket = data.markets.length > 1
  return (
    <ChartCard
      className={className}
      action={<ReportLink to="/reports/targets" />}
      title="Salespeople vs target"
      subtitle={`This cycle (${data.cycle.label}) · ${data.cycle.daysLeft} days left`}
      legend={[
        { label: 'Collected', color: chartColors.primary },
        { label: `On pace today (${data.cycle.pace}%)`, color: 'var(--color-fg-secondary)', kind: 'tick' },
      ]}
      table={{
        columns: ['Salesperson', 'Collected', 'Target', 'Achieved'],
        rows: people.map((person) => [person.name, formatCompact(person.achieved, person.currency), formatCompact(person.target, person.currency), `${person.achievedShare}%`]),
      }}
    >
      <BarList
        max={Math.max(100, ...people.map((person) => person.achievedShare))}
        rows={people.map((person) => ({
          label: person.name,
          value: person.achievedShare,
          display: `${person.achievedShare}%`,
          note: showMarket ? data.markets.find((market) => market.id === person.market)?.name : undefined,
          marker: data.cycle.pace,
          details: [
            { label: 'Collected', value: formatCompact(person.achieved, person.currency) },
            { label: 'Target', value: formatCompact(person.target, person.currency) },
            { label: 'On pace today', value: `${data.cycle.pace}%` },
          ],
        }))}
      />
    </ChartCard>
  )
}

export function CollectionsCard({ data, className }: CardProps) {
  const rows = data.collectionsByMonth
  const money = (value: number) => formatCompact(value, data.currency)
  const series = [
    { key: 'collected', label: 'Collected', color: chartColors.primary, values: rows.map((row) => row.collected), area: true },
    { key: 'target', label: 'Target', color: chartColors.context, values: rows.map((row) => row.target), dashed: true },
  ]
  return (
    <ChartCard
      className={className}
      action={<ReportLink to="/reports/targets?group=company" />}
      title="Collections vs target"
      subtitle={`Fiscal year ${data.year}, running total · ${data.currency}${data.markets.length > 1 ? ' at indicative rates' : ''}`}
      legend={[
        { label: 'Collected', color: chartColors.primary, kind: 'line' },
        { label: 'Target', color: chartColors.context, kind: 'dashed' },
      ]}
      table={{ columns: ['Month', 'Collected (to date)', 'Target (to date)'], rows: rows.map((row) => [row.month, row.collected === null ? '—' : money(row.collected), money(row.target)]) }}
    >
      <LineChart label="Collections against target, running total for the year" labels={rows.map((row) => row.month)} titles={rows.map((row) => `End of ${row.month}`)} series={series} format={money} height={240} />
    </ChartCard>
  )
}

export function MarketsCard({ data, className }: CardProps) {
  const rows = data.markets.map((market) => ({ ...market, achieved: percent(market.collected, market.target) }))
  return (
    <ChartCard
      className={className}
      action={<ReportLink to="/reports/targets?group=company" />}
      title={rows.length > 1 ? 'Markets side by side' : 'Year-to-date target'}
      subtitle="Collected vs target to date, each in its own currency"
      legend={[
        ...rows.map((row) => ({ label: row.name, color: marketColor(row.id) })),
        { label: 'Target to date', color: 'var(--color-fg-secondary)', kind: 'tick' as const },
      ]}
      table={{
        columns: ['Market', 'Collected', 'Target to date', 'Achieved', 'Pipeline', 'New leads'],
        rows: rows.map((row) => [row.name, formatCompact(row.collected, row.currency), formatCompact(row.target, row.currency), `${row.achieved}%`, formatCompact(row.pipeline, row.currency), row.newLeads]),
      }}
    >
      <BarList
        max={Math.max(100, ...rows.map((row) => row.achieved))}
        rows={rows.map((row) => ({
          label: row.name,
          value: row.achieved,
          display: `${row.achieved}%`,
          color: marketColor(row.id),
          marker: 100,
          note: `${formatCompact(row.collected, row.currency)} of ${formatCompact(row.target, row.currency)}`,
          details: [
            { label: 'Collected', value: formatCompact(row.collected, row.currency) },
            { label: 'Target to date', value: formatCompact(row.target, row.currency) },
            { label: 'Open pipeline', value: formatCompact(row.pipeline, row.currency) },
            { label: `New leads (${data.period.label.toLowerCase()})`, value: row.newLeads },
          ],
        }))}
      />
      <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg bg-surface-sunken p-3">
            <dt className="flex items-center gap-1.5 text-fg-muted">
              <MarketIcon scope={row.id} className="size-4" /> {row.name}
            </dt>
            <dd className="mt-1.5 space-y-0.5 text-fg-secondary">
              <p>
                Pipeline <span className="font-semibold text-fg tabular-nums">{formatCompact(row.pipeline, row.currency)}</span>
              </p>
              <p>
                New leads <span className="font-semibold text-fg tabular-nums">{row.newLeads}</span>
              </p>
            </dd>
          </div>
        ))}
      </dl>
    </ChartCard>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-label="Loading dashboard">
      <div className="h-8 w-64 rounded bg-surface-strong" />
      <div className="h-8 w-56 rounded-lg bg-surface-strong" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-36 rounded-xl bg-surface-strong" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="h-72 rounded-xl bg-surface-strong xl:col-span-2" />
        <div className="h-72 rounded-xl bg-surface-strong" />
      </div>
    </div>
  )
}
