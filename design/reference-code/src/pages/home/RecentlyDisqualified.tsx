import { useQuery } from '@tanstack/react-query'
import { useInTeam } from './useTeam'
import { Link } from 'react-router'
import { Card, CardHeader } from '../../components/ui/Card'
import { timeAgo } from '../../lib/format'
import { useMarket } from '../../lib/useMarket'
import { useViewer } from '../../lib/useRole'
import { primaryContact } from '../../mocks/leads'
import { leadsApi } from '../../api/leads'
import { useLeadMutation } from '../leads/useLeadMutation'

/** The sales manager's review of leads disqualified in the last week, with one-click Reopen. */
export function RecentlyDisqualified({ className }: { className?: string }) {
  const viewer = useViewer()
  const { scope } = useMarket()
  const inTeam = useInTeam()
  const { data: all } = useQuery({ queryKey: ['leads', 'recently-disqualified', viewer.role, viewer.name, scope], queryFn: () => leadsApi.recentlyDisqualified(viewer, scope) })
  const leads = all?.filter((lead) => inTeam(lead.repId))
  const reopen = useLeadMutation((id: string) => leadsApi.reopen(id, viewer.name))

  return (
    <Card className={className}>
      <CardHeader title="Recently disqualified · last 7 days" action={<span className="text-xs text-fg-muted">{leads?.length ?? '–'} leads</span>} />
      {leads && leads.length === 0 ? (
        <p className="px-5 py-6 text-sm text-fg-muted">Nothing disqualified this week.</p>
      ) : (
        <ul className="max-h-80 divide-y divide-line-subtle overflow-y-auto">
          {leads?.slice(0, 20).map((lead) => (
            <li key={lead.id} className="flex items-center gap-3 px-5 py-3 motion-safe:animate-fade-in">
              <div className="min-w-0 flex-1">
                <Link to={`/leads/${lead.id}`} className="block truncate text-sm font-medium text-fg hover:underline">
                  {lead.company || primaryContact(lead).name}
                </Link>
                <p className="truncate text-xs text-fg-muted">
                  <span className="font-medium text-red-700 dark:text-red-300">{lead.disqualifyReason}</span> · {lead.repName ?? 'Unassigned'} · {timeAgo(lead.disqualifiedAt!)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => reopen.mutate(lead.id)}
                disabled={reopen.isPending && reopen.variables === lead.id}
                className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-muted disabled:opacity-50"
              >
                Reopen
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
