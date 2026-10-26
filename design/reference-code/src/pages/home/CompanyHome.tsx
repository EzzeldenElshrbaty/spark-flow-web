import { Inbox, Timer, TrendingUp, Trophy } from 'lucide-react'
import { Link } from 'react-router'
import { Card, CardHeader } from '../../components/ui/Card'
import { PageHeader } from '../../components/ui/PageHeader'
import { formatCompact, formatMoney, percent } from '../../lib/format'
import { useMarket } from '../../lib/useMarket'
import { useRole } from '../../lib/useRole'
import { CollectionsCard, DashboardSkeleton, FunnelCard, MarketsCard, NewLeadsCard, PeriodBar, PipelineCard, SalespeopleCard, SourcesCard } from './DashboardCharts'
import { FollowUpsBySalespersonCard, NoNextStepCard } from './FollowUpCards'
import { RecentlyDisqualified } from './RecentlyDisqualified'
import { usePendingApprovals } from '../approvals/usePendingApprovals'
import { MoneyDueCard, NeedsAttentionCard } from './AttentionCards'
import { DashboardRow, narrow, wide } from './DashboardRow'
import { StatCard } from './StatCard'
import { useDashboard } from './useDashboard'

export function CompanyHome() {
  const { role } = useRole()
  const { market } = useMarket()
  const { data: dashboard, period, setPeriod } = useDashboard()

  if (!dashboard) return <DashboardSkeleton />

  const { kpis, currency, cycle } = dashboard
  const isManagement = role === 'Management'
  const compareLabel = dashboard.period.compareLabel
  const money = (value: number) => formatCompact(value, currency)
  const team = dashboard.salespeople.map((person) => person.name.split(' ')[0]).join(', ')
  const subtitle = !isManagement
    ? team
      ? `Your team: ${team}`
      : 'No salespeople work under you yet. Management sets this in Settings → Users.'
    : market
      ? `Fiscal year ${dashboard.year} · ${market.name}`
      : `Fiscal year ${dashboard.year} · all markets, in EGP at indicative rates`
  const teamTarget = percent(dashboard.target.achieved, dashboard.target.target)
  const ytd = percent(dashboard.collectedYtd.value, dashboard.collectedYtd.target)

  return (
    <>
      <PageHeader title={!isManagement ? 'My team' : market ? `${market.name} overview` : 'Company overview'} subtitle={subtitle} />
      <PeriodBar period={period} onChange={setPeriod} currency={currency} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {isManagement ? (
          <StatCard
            label="Collected this year"
            value={ytd}
            format={(value) => `${Math.round(value)}%`}
            ring={ytd}
            hint={`${money(dashboard.collectedYtd.value)} of ${money(dashboard.collectedYtd.target)} target to date`}
          />
        ) : (
          <StatCard
            label="Team target this cycle"
            value={teamTarget}
            format={(value) => `${Math.round(value)}%`}
            ring={teamTarget}
            hint={`${money(dashboard.target.achieved)} of ${money(dashboard.target.target)} · ${cycle.daysLeft} days left`}
          />
        )}
        <StatCard
          icon={TrendingUp}
          label="Open pipeline"
          value={kpis.pipeline.value}
          format={money}
          delta={{ previous: kpis.pipeline.previous, compareLabel }}
          hint={`Weighted forecast ${money(kpis.weighted)} (estimate)`}
          trend={kpis.pipeline.trend}
        />
        {isManagement ? (
          <StatCard
            icon={Trophy}
            label="Win rate"
            value={kpis.winRate.value}
            format={(value) => `${Math.round(value)}%`}
            delta={{ previous: kpis.winRate.previous, unit: 'points', compareLabel }}
            trend={kpis.winRate.trend}
          />
        ) : (
          <StatCard
            icon={Timer}
            label="SLA breaches"
            value={kpis.slaBreaches.value}
            alert={kpis.slaBreaches.value > 0}
            delta={{ previous: kpis.slaBreaches.previous, goodWhen: 'down', compareLabel }}
            trend={kpis.slaBreaches.trend}
          />
        )}
        <StatCard
          icon={Inbox}
          label="New leads"
          value={kpis.newLeads.value}
          delta={{ previous: kpis.newLeads.previous, compareLabel }}
          trend={kpis.newLeads.trend}
        />
      </div>

      <DashboardRow>
        <NeedsAttentionCard data={dashboard} className={wide} />
        <MoneyDueCard data={dashboard} className={narrow} />
      </DashboardRow>

      {/* The company year is Management's; a Sales Manager's Home is their team only. */}
      {isManagement && (
        <DashboardRow>
          <CollectionsCard data={dashboard} className={wide} />
          <MarketsCard data={dashboard} className={narrow} />
        </DashboardRow>
      )}

      <DashboardRow>
        <SalespeopleCard data={dashboard} className={narrow} />
        <PipelineCard data={dashboard} className={narrow} />
        <FunnelCard data={dashboard} className={narrow} />
      </DashboardRow>
      <DashboardRow>
        <NewLeadsCard data={dashboard} className={wide} />
        <SourcesCard data={dashboard} className={narrow} />
      </DashboardRow>
      <DashboardRow>
        <PendingApprovalsCard className={wide} />
        <RecentlyDisqualified className={narrow} />
      </DashboardRow>
      <DashboardRow>
        <FollowUpsBySalespersonCard className={wide} />
        <NoNextStepCard className={narrow} />
      </DashboardRow>
    </>
  )
}

/** What's waiting in Approvals: discounts to review, signed deals to confirm, exchange rates. */
function PendingApprovalsCard({ className }: { className?: string }) {
  const { role } = useRole()
  const { discounts, wonRequests, exchangeRates, count } = usePendingApprovals()
  const rows = [
    ...discounts.map((item) => ({ key: item.versionId, to: `/opportunities/${item.id}`, title: `${item.company} · proposal v${item.version}`, detail: `Proposal to approve · ${item.approval.discountPct}% off list · ${item.approval.requestedBy}` })),
    ...(role === 'Management' ? wonRequests.map((item) => ({ key: `won-${item.id}`, to: `/opportunities/${item.id}`, title: `${item.company} · client signed`, detail: `Confirm Won · ${formatMoney(item.value, item.currency)} · ${item.repName}` })) : []),
    ...exchangeRates.map((item) => ({ key: item.id, to: '/approvals', title: item.title, detail: `Exchange rate · ${item.detail}` })),
  ]
  return (
    <Card className={className}>
      <CardHeader title={`Pending approvals · ${count}`} action={<Link to="/approvals" className="text-sm font-medium text-accent hover:text-accent-strong">Open Approvals</Link>} />
      {rows.length === 0 ? (
        <p className="px-5 py-4 text-sm text-fg-muted">Nothing waiting for you.</p>
      ) : (
        <ul className="divide-y divide-line-subtle">
          {rows.slice(0, 6).map((row) => (
            <li key={row.key}>
              <Link to={row.to} className="flex items-center gap-3 px-5 py-3.5 hover:bg-surface-sunken">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{row.title}</p>
                  <p className="truncate text-xs text-fg-muted">{row.detail}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
