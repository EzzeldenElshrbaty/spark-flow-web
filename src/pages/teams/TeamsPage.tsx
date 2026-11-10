import { MessageSquare, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useOpenDm } from '@/api/chat'
import { useCreateTeam, useProjectSummaries, useRemoveTeam, useRenameTeam, useTeams } from '@/api/projects'
import { useMe, useUsers } from '@/api/users'
import type { Team, User } from '@/api/types'
import { ConfirmDeleteSheet } from '@/components/ConfirmDeleteSheet'
import { RowMenu } from '@/components/RowMenu'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Field, inputClass } from '@/components/ui/Field'
import { Sheet, SheetCancelButton } from '@/components/ui/Sheet'
import { Avatar } from '@/components/Avatar'
import { Card, CardHeader } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { QueryError } from '@/components/ui/QueryError'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { paths } from '@/lib/paths'
import { usePermission } from '@/lib/usePermission'
import { announce } from '@/components/sf/Announcer'

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
        <Avatar name={user.name} size={24} decorative />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-fg">{user.name}</span>
          <span className="block truncate text-xs text-fg-muted">{user.title}</span>
        </span>
        {workspaceId && canMessage && (
          // One quiet icon per row, not a column of outlined buttons (UX Phase 4, 4.10).
          <IconButton
            label={`Message ${user.name}`}
            icon={MessageSquare}
            size="sm"
            touch
            disabled={open.isPending}
            onClick={() => open.mutate({ workspaceId, userIds: [user.id] }, { onSuccess: (dm) => navigate(paths.channel(workspaceSlug, dm.id)) })}
          />
        )}
      </div>
      {open.isError && (
        <p role="alert" className="mt-1 ps-11 text-xs text-red-600 dark:text-red-400">
          {(open.error as Error).message || "Couldn’t open the conversation."}
        </p>
      )}
    </li>
  )
}

/** New team or Rename (UX Phase 2, 2.4): one name, asking before a typed one is thrown away. */
function TeamNameSheet({ workspaceId, team, onClose }: { workspaceId: string; team?: Team; onClose: () => void }) {
  const create = useCreateTeam()
  const rename = useRenameTeam()
  // Read out once the sheet has closed (UX Phase 5A, 5.12).
  const done = (sentence: string) => () => {
    onClose()
    announce(sentence)
  }
  const save = team ? rename : create
  const [name, setName] = useState(team?.name ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const submit = () => {
    if (!name.trim()) return setProblem('Name the team.')
    setProblem(null)
    if (team) rename.mutate({ id: team.id, name: name.trim() }, { onSuccess: done('Team saved.') })
    else create.mutate({ workspaceId, name: name.trim() }, { onSuccess: done(`Team ${name.trim()} created.`) })
  }
  return (
    <Sheet
      open
      onClose={onClose}
      dirty={name !== (team?.name ?? '')}
      discardQuestion={team ? 'Discard your changes?' : 'Discard this new team?'}
      title={team ? `Rename ${team.name}` : 'New team'}
      footer={
        <>
          <SheetCancelButton />
          <Button onClick={submit} disabled={save.isPending}>
            {team ? (save.isPending ? 'Renaming…' : 'Rename') : save.isPending ? 'Adding…' : 'Add team'}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="Name" required error={problem ?? (save.error as Error | null)?.message}>
          <input className={inputClass} value={name} maxLength={40} placeholder="Data" onChange={(e) => setName(e.target.value)} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}

/**
 * Teams and who is in them, with the projects each team is on. Whoever may change settings makes, renames and removes
 * teams here (UX Phase 2, 2.4); who is on a team is set on Settings → Users.
 */
export function TeamsPage() {
  const { workspace } = useCurrentWorkspace()
  const ws = workspace?.slug ?? ''
  const teams = useTeams(workspace?.id)
  const users = useUsers(workspace?.id).data ?? []
  const projects = useProjectSummaries(workspace?.id).data ?? []
  const meId = useMe().data?.id
  const manages = usePermission()('settings.manage')
  const remove = useRemoveTeam()
  const [naming, setNaming] = useState<{ team?: Team } | null>(null)
  const [removing, setRemoving] = useState<Team | null>(null)

  return (
    <>
      <PageHeader
        title="Teams"
        subtitle="Teams and who is in them."
        actions={
          manages ? (
            <Button variant="secondary" onClick={() => setNaming({})}>
              <Plus className="size-4" /> New team
            </Button>
          ) : undefined
        }
      />
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
                <CardHeader
                  title={`${team.name} · ${members.length} ${members.length === 1 ? 'person' : 'people'}`}
                  action={
                    manages ? (
                      <RowMenu
                        label={`${team.name} actions`}
                        items={[
                          { label: 'Rename', icon: Pencil, onSelect: () => setNaming({ team }) },
                          { label: 'Remove', icon: Trash2, danger: true, onSelect: () => setRemoving(team) },
                        ]}
                      />
                    ) : undefined
                  }
                />
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
      {naming && workspace && <TeamNameSheet workspaceId={workspace.id} team={naming.team} onClose={() => setNaming(null)} />}
      <ConfirmDeleteSheet
        open={removing !== null}
        title={`Remove ${removing?.name ?? ''}?`}
        description="Its people stay; they leave the team. A team a project still uses can’t be removed."
        actionLabel="Remove team"
        pendingLabel="Removing…"
        onConfirm={() => remove.mutateAsync(removing!.id)}
        onClose={() => setRemoving(null)}
      />
    </>
  )
}
