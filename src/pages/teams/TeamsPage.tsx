import { Link } from 'react-router'
import { useProjectSummaries, useTeams } from '@/api/projects'
import { useUsers } from '@/api/users'
import { Avatar } from '@/components/ui/Avatar'
import { Card, CardHeader } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { QueryError } from '@/components/ui/QueryError'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { paths } from '@/lib/paths'

/** Teams and who is in them, with the projects each team is on. Read-only: editing teams is past the cut line. */
export function TeamsPage() {
  const { workspace } = useCurrentWorkspace()
  const ws = workspace?.slug ?? ''
  const teams = useTeams(workspace?.id)
  const users = useUsers(workspace?.id).data ?? []
  const projects = useProjectSummaries(workspace?.id).data ?? []

  return (
    <>
      <PageHeader title="Teams" subtitle="Teams and who is in them." />
      {teams.isError ? (
        <QueryError what="Teams" onRetry={() => void teams.refetch()} />
      ) : teams.isPending ? (
        <div className="grid gap-5 lg:grid-cols-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-surface-muted" />
          ))}
        </div>
      ) : teams.data.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong p-10 text-center text-sm text-fg-secondary">No teams yet.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {teams.data.map((team) => {
            const members = users.filter((u) => team.memberIds.includes(u.id))
            const onProjects = projects.filter((p) => p.teamIds.includes(team.id))
            return (
              <Card key={team.id}>
                <CardHeader title={`${team.name} · ${members.length} ${members.length === 1 ? 'person' : 'people'}`} />
                <ul className="divide-y divide-line-subtle px-5">
                  {members.map((u) => (
                    <li key={u.id} className="flex items-center gap-3 py-2.5">
                      <Avatar name={u.name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">{u.name}</span>
                        <span className="block truncate text-xs text-fg-muted">{u.title}</span>
                      </span>
                    </li>
                  ))}
                  {members.length === 0 && <li className="py-3 text-sm text-fg-muted">No one yet.</li>}
                </ul>
                <div className="flex flex-wrap items-center gap-2 border-t border-line-subtle px-5 py-3 text-sm">
                  <span className="text-xs text-fg-muted">On</span>
                  {onProjects.length === 0 ? (
                    <span className="text-fg-muted">—</span>
                  ) : (
                    onProjects.map((p) => (
                      <Link key={p.id} to={paths.project(ws, p.key)} className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-fg-secondary hover:text-fg">
                        {p.name}
                      </Link>
                    ))
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
