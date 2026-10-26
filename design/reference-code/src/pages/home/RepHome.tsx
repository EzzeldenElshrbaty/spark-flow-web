import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CalendarCheck, TrendingUp, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { Card, CardHeader } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import { formatCompact, formatMoney, percent } from '../../lib/format'
import { useMarket } from '../../lib/useMarket'
import { useRole, useViewer } from '../../lib/useRole'
import { opportunitiesApi } from '../../api/opportunities'
import { Avatar } from '../leads/shared'
import { StageBadge } from '../opportunities/shared'
import { usePipelineStages } from '../opportunities/useOpportunities'
import { ActivitiesCard, DashboardSkeleton, LeadsByStatusCard, PeriodBar, PipelineCard } from './DashboardCharts'
import { MyDayCard, NoNextStepCard } from './FollowUpCards'
import { MoneyDueCard, NeedsAttentionCard } from './AttentionCards'
import { DashboardRow, narrow, wide } from './DashboardRow'
import { StatCard } from './StatCard'
import { useDashboard } from './useDashboard'

export function RepHome() {
  const { data: dashboard, period, setPeriod } = useDashboard()
  const firstName = useRole().persona.name.split(' ')[0]

  if (!dashboard) return <DashboardSkeleton />

  const { kpis, target, cycle, currency } = dashboard
  const achieved = percent(target.achieved, target.target)
  const compareLabel = dashboard.period.compareLabel
  const overdue = kpis.overdueActions

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        subtitle={overdue ? `${overdue} overdue next ${overdue === 1 ? 'step' : 'steps'} on your leads` : 'Your day at a glance'}
      />
      <PeriodBar period={period} onChange={setPeriod} currency={currency} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Target this cycle"
          value={achieved}
          format={(value) => `${Math.round(value)}%`}
          ring={achieved}
          hint={`${formatCompact(target.achieved, currency)} of ${formatCompact(target.target, currency)} · ${cycle.daysLeft} days left`}
        />
        <StatCard
          icon={TrendingUp}
          label="My open pipeline"
          value={kpis.pipeline.value}
          format={(value) => formatCompact(value, currency)}
          delta={{ previous: kpis.pipeline.previous, compareLabel }}
          trend={kpis.pipeline.trend}
        />
        <StatCard
          icon={CalendarCheck}
          label="Meetings held"
          value={kpis.meetings.value}
          delta={{ previous: kpis.meetings.previous, unit: 'count', compareLabel }}
          trend={kpis.meetings.trend}
        />
        <StatCard icon={TriangleAlert} label="Overdue next steps" value={overdue} alert={overdue > 0} hint={`Past due, of ${kpis.openLeads} open leads`} />
      </div>

      <DashboardRow>
        <MyDayCard className={wide} />
        <NoNextStepCard className={narrow} />
      </DashboardRow>
      <DashboardRow>
        <NeedsAttentionCard data={dashboard} className={wide} />
        <MoneyDueCard data={dashboard} title="Money to collect on my deals" className={narrow} />
      </DashboardRow>
      <DashboardRow>
        <ActivitiesCard data={dashboard} className={wide} />
        <PipelineCard data={dashboard} title="My pipeline by stage" className={narrow} />
      </DashboardRow>
      <DashboardRow>
        <LeadsByStatusCard data={dashboard} className={narrow} />
        <RecentOpportunities className={wide} />
      </DashboardRow>
    </>
  )
}

/** The salesperson's newest opportunities (converted leads), with stage and value. */
function RecentOpportunities({ className }: { className?: string }) {
  const viewer = useViewer()
  const { scope } = useMarket()
  const stages = usePipelineStages()
  const { data } = useQuery({
    queryKey: ['opportunities', 'recent', viewer.name, scope],
    queryFn: () => opportunitiesApi.list(viewer, scope, { tab: 'all', search: '', sort: 'newest', page: 1, pageSize: 5 }),
  })
  if (!data?.items.length) return null
  return (
    <Card className={className}>
      <CardHeader title="My latest opportunities" action={<Link to="/opportunities" className="text-sm font-medium text-accent hover:text-accent-strong">Pipeline</Link>} />
      <ul className="divide-y divide-line-subtle">
        {data.items.map((deal) => (
          <li key={deal.id}>
            <Link to={`/opportunities/${deal.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-sunken">
              <Avatar name={deal.company} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{deal.company}</p>
                <p className="truncate text-xs text-fg-muted">{deal.contactName}</p>
              </div>
              <StageBadge stage={stages.find((stage) => stage.id === deal.stageId)?.label ?? deal.stageId} status={deal.status} />
              <span className="hidden w-28 text-right text-sm font-medium tabular-nums sm:block">{formatMoney(deal.value, deal.currency)}</span>
              <ArrowRight className="hidden size-4 text-fg-subtle sm:block" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Morning, afternoon or evening, by the viewer's clock. */
function greeting(hour = new Date().getHours()) {
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}
