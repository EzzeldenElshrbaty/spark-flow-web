import clsx from 'clsx'
import { Check, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useDeliverables, useRemoveDeliverable, useUpdateDeliverable } from '@/api/projects'
import type { Deliverable, Phase, ProjectSummary, Team, User } from '@/api/types'
import { ConfirmDeleteSheet } from '@/components/ConfirmDeleteSheet'
import { RowMenu } from '@/components/RowMenu'
import { Avatar } from '@/components/Avatar'
import { Card, CardHeader } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { behindSchedule, finishHint, progressTone } from '@/pages/projects/projectStats'
import { formatDate, formatHours, formatMoney } from '@/lib/format'
import { DeliverableSheet } from './DeliverableSheet'
import { ProjectFiles } from './ProjectFiles'
import { isPastDue } from '@/lib/dates'
import { usePermission } from '@/lib/usePermission'
import { StatTile } from '@/components/ui/StatTile'
import { dueText } from './projectStats'

function Deliverables({ project, phases, canEdit }: { project: ProjectSummary; phases: Phase[]; canEdit: boolean }) {
  const deliverables = useDeliverables(project.id)
  const update = useUpdateDeliverable()
  const remove = useRemoveDeliverable()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Deliverable | null>(null)
  const [deleting, setDeleting] = useState<Deliverable | null>(null)
  const phaseName = (id: string | null) => phases.find((p) => p.id === id)?.name ?? '—'
  const now = new Date()
  const rows = [...(deliverables.data ?? [])].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))

  return (
    <Card>
      <CardHeader
        title="Deliverables"
        action={
          canEdit && (
            <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-strong">
              <Plus className="size-4" /> Add deliverable
            </button>
          )
        }
      />
      <div className="px-5 py-2">
        {deliverables.isPending ? (
          <div className="my-3 h-10 animate-pulse rounded-lg bg-surface-muted" aria-hidden />
        ) : deliverables.isError ? (
          <p className="py-3 text-sm text-red-600 dark:text-red-400">Deliverables couldn’t be loaded.</p>
        ) : rows.length === 0 ? (
          <p className="py-3 text-sm text-fg-muted">No deliverables yet.</p>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {rows.map((d) => {
              const done = Boolean(d.doneAt)
              const late = !done && isPastDue(d.dueDate, now)
              return (
                <li key={d.id} className="flex items-center gap-3 py-2.5">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={done}
                    aria-label={`${d.title} done`}
                    disabled={!canEdit || update.isPending}
                    onClick={() => update.mutate({ id: d.id, patch: { doneAt: done ? null : new Date().toISOString() } })}
                    className={clsx(
                      'grid size-5 shrink-0 place-items-center rounded-md ring-1 disabled:cursor-default',
                      done ? 'bg-emerald-600 text-white ring-emerald-600' : 'text-transparent ring-line-input',
                      canEdit && !done && 'hover:ring-fg-muted',
                    )}
                  >
                    <Check className="size-3.5" strokeWidth={3} />
                  </button>
                  <span className="min-w-0 flex-1">
                    <span className={clsx('block truncate text-sm', done ? 'text-fg-muted line-through' : 'text-fg')}>{d.title}</span>
                    <span className="block truncate text-xs text-fg-muted">{phaseName(d.phaseId)}</span>
                  </span>
                  <span className={clsx('shrink-0 text-xs tabular-nums', late ? 'font-medium text-red-600 dark:text-red-400' : 'text-fg-muted')}>
                    {done ? `Done ${formatDate(d.doneAt!)}` : dueText(d.dueDate, late)}
                  </span>
                  {canEdit && (
                    <RowMenu
                      label={`Actions for ${d.title}`}
                      items={[
                        { label: 'Edit deliverable', icon: Pencil, onSelect: () => setEditing(d) },
                        { label: 'Delete deliverable', icon: Trash2, danger: true, onSelect: () => setDeleting(d) },
                      ]}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {update.error && <p className="pb-2 text-sm text-red-600 dark:text-red-400">{(update.error as Error).message}</p>}
      </div>
      {adding && <DeliverableSheet project={project} phases={phases} onClose={() => setAdding(false)} />}
      {editing && <DeliverableSheet project={project} phases={phases} deliverable={editing} onClose={() => setEditing(null)} />}
      <ConfirmDeleteSheet
        open={deleting !== null}
        title={`Delete ${deleting?.title ?? 'deliverable'}?`}
        description="This can’t be undone."
        actionLabel="Delete deliverable"
        onConfirm={() => remove.mutateAsync(deleting!.id)}
        onClose={() => setDeleting(null)}
      />
    </Card>
  )
}

function TeamCard({ project, people, teams }: { project: ProjectSummary; people: User[]; teams: Team[] }) {
  const manager = people.find((u) => u.id === project.managerId)
  const members = people.filter((u) => u.id !== project.managerId && project.memberIds.includes(u.id))
  const projectTeams = teams.filter((t) => project.teamIds.includes(t.id))
  return (
    <Card>
      <CardHeader title="Team" />
      <div className="space-y-3 p-5">
        <ul className="space-y-2.5">
          {manager && (
            <li className="flex items-center gap-3">
              <Avatar name={manager.name} size={24} decorative />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg">{manager.name}</span>
                <span className="block truncate text-xs text-fg-muted">Project manager</span>
              </span>
            </li>
          )}
          {members.map((u) => (
            <li key={u.id} className="flex items-center gap-3">
              <Avatar name={u.name} size={24} decorative />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg">{u.name}</span>
                <span className="block truncate text-xs text-fg-muted">{u.title}</span>
              </span>
            </li>
          ))}
        </ul>
        {!manager && members.length === 0 && <p className="text-sm text-fg-muted">No one yet.</p>}
        {projectTeams.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-line-subtle pt-3">
            {projectTeams.map((t) => (
              <span key={t.id} className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-fg-secondary">
                {t.name} · {t.memberIds.length}
              </span>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

/** Overview: the numbers, what the project is, what it delivers, who works on it, and its files. */
export function OverviewTab({
  project,
  phases,
  people,
  teams,
  canEdit,
  canPost,
}: {
  project: ProjectSummary
  phases: Phase[]
  people: User[]
  teams: Team[]
  canEdit: boolean
  canPost: boolean
}) {
  // Removing someone else's file is the manager's (and Admins').
  const canManageFiles = usePermission()('phase.manage', { project })
  const now = new Date()
  // The same "behind" rule as the Dashboard and the progress bars (UX Phase 3, 3.3).
  const late = behindSchedule(project, now)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Progress" value={`${Math.round(project.progress * 100)}%`}>
          <div className="mt-2">
            <ProgressBar value={project.progress * 100} label="Progress" tone={progressTone(project, now)} />
          </div>
        </StatTile>
        <StatTile label="Hours logged" value={formatHours(project.loggedHours)} hint={`${project.taskCount} tasks · ${project.overdueCount} overdue${project.overEstimateCount ? ` · ${project.overEstimateCount} over estimate` : ''}`} />
        <StatTile label="Expected finish" value={formatDate(project.expectedFinish)} hint={finishHint(project, now)} tone={late ? 'danger' : undefined} />
        {project.cost !== null && <StatTile label="Cost so far" value={formatMoney(project.cost)} hint="Hours × hourly cost" />}
      </div>

      {/* One column that never grows past the screen on phones (UX Phase 5B final review). */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="About" />
            <p className="whitespace-pre-line p-5 text-sm text-fg-secondary">{project.description.trim() || '—'}</p>
          </Card>
          <Deliverables project={project} phases={phases} canEdit={canEdit} />
        </div>
        <div className="space-y-5">
          <TeamCard project={project} people={people} teams={teams} />
          <ProjectFiles projectId={project.id} people={people} canUpload={canPost} canManage={canManageFiles} />
        </div>
      </div>
    </div>
  )
}
