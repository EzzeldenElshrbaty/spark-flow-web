import { MessageSquare } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { useOpenDm } from '@/api/chat'
import { useProjectSummaries, useTeams } from '@/api/projects'
import { useMe, useUsers } from '@/api/users'
import type { User } from '@/api/types'
import { Avatar } from '@/components/ui/Avatar'
import { Card, CardHeader } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { QueryError } from '@/components/ui/QueryError'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { paths } from '@/lib/paths'

/**
 * One person in a team, with "Message", which opens (or starts) the conversation with them. The button waits until
 * your own account has loaded (`canMessage`), and is left out on your own row.
 */
function MemberRow({ user, workspaceId, workspaceSlug, canMessage }: { user: User; workspaceId?: string; workspaceSlug: string; canMessage: boolean }) {
  const navigate = useNavigate()
  const open = useOpenDm()
  return (
    <li className="py-2.5">
      <div className="flex items-center gap-3">
        <Avatar name={user.name} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-fg">{user.name}</span>
          <span className="block truncate text-xs text-fg-muted">{user.title}</span>
        </span>
        {workspaceId && canMessage && (
          <button
            type="button"
            disabled={open.isPending}
            aria-label={`Message ${user.name}`}
            onClick={() => open.mutate({ workspaceId, userIds: [user.id] }, { onSuccess: (dm) => navigate(paths.channel(workspaceSlug, dm.id)) })}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-fg-secondary ring-1 ring-line hover:bg-surface-muted disabled:opacity-60"
          >
            <MessageSquare className="size-3.5" /> {open.isPending ? 'Opening…' : 'Message'}
          </button>
        )}
      </div>
      {open.isError && (
        <p role="alert" className="mt-1 ps-11 text-xs text-red-600 dark:text-red-400">
          {(open.error as Error).message || "Couldn't open the conversation."}
        </p>
      )}
    </li>
  )
}

/** Teams and who is in them, with the projects each team is on. Read-only: editing teams is past the cut line. */
export function TeamsPage() {
  const { workspace } = useCurrentWorkspace()
  const ws = workspace?.slug ?? ''
  const teams = useTeams(workspace?.id)
  const users = useUsers(workspace?.id).data ?? []
  const projects = useProjectSummaries(workspace?.id).data ?? []
  const meId = useMe().data?.id

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
                    <MemberRow key={u.id} user={u} workspaceId={workspace?.id} workspaceSlug={ws} canMessage={meId !== undefined && u.id !== meId} />
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
