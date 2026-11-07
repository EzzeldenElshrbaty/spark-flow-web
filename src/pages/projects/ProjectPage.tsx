import { Building2, CalendarDays, Layers, Link2, Pencil, Plus, UserRound, Archive } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { useArchiveProject, usePhases, useProjectSummary, useRestoreProject, useTeams } from '@/api/projects'
import { useSprints, useTickets } from '@/api/tickets'
import type { ProjectStatus } from '@/api/types'
import { useMe, useUsers } from '@/api/users'
import { ConfirmDeleteSheet } from '@/components/ConfirmDeleteSheet'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { QueryError } from '@/components/ui/QueryError'
import { RecordActionBarSpacer, RecordHeader, type RecordAction, type RecordMeta } from '@/components/ui/RecordHeader'
import { StageProgress } from '@/components/ui/StageProgress'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { formatDate } from '@/lib/format'
import { paths, type ProjectTab } from '@/lib/paths'
import { usePermission } from '@/lib/usePermission'
import { NotFound } from '@/pages/NotFound'
import { OverviewTab } from './OverviewTab'
import { PhasesSheet } from './PhasesSheet'
import { ProjectTabs } from './ProjectTabs'
import { ProjectSheet } from './ProjectSheet'
import { stagesOf } from './phases'
import { TaskSheet } from './TaskSheet'
import { ChatTab } from './ChatTab'
import { TasksTab } from './TasksTab'
import { HistoryTab } from '@/pages/projects/HistoryTab'
import { FilesTab } from '@/pages/projects/FilesTab'
import { TimeTab } from './TimeTab'

const statusBadge: Record<ProjectStatus, [string, BadgeTone]> = {
  planned: ['Planned', 'neutral'],
  active: ['Active', 'info'],
  onHold: ['On hold', 'warning'],
  delivered: ['Delivered', 'success'],
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')

/** Only https links are shown as links; anything else is left out. */
const safeLink = (url: string) => {
  try {
    return new URL(url).protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

function PageSkeleton() {
  return (
    <div aria-hidden>
      <div className="mb-4 flex items-start gap-3">
        <div className="size-10 animate-pulse rounded-full bg-surface-muted" />
        <div className="space-y-2">
          <div className="h-7 w-56 animate-pulse rounded-lg bg-surface-muted" />
          <div className="h-4 w-80 max-w-full animate-pulse rounded bg-surface-muted" />
        </div>
      </div>
      <div className="mb-5 h-11 animate-pulse rounded-lg bg-surface-muted" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-muted" />
        ))}
      </div>
    </div>
  )
}

/** A project: header, phases bar, and its six tabs (Overview, Tasks, Chat, Time, History, Files), each its own address. */
export function ProjectPage() {
  const { ws = '', projectKey = '', tab: tabParam = '' } = useParams()
  const tab = tabParam as ProjectTab // the router only renders this page for a known tab
  const { workspace } = useCurrentWorkspace()
  const summary = useProjectSummary(workspace?.id, projectKey)
  const project = summary.data ?? undefined
  const phases = usePhases(project?.id)
  const tasks = useTickets(project?.id)
  const users = useUsers(workspace?.id)
  const people = users.data ?? []
  const teams = useTeams(workspace?.id).data ?? []
  const me = useMe().data
  const check = usePermission()
  const now = useMemo(() => new Date(), [])
  const sprints = useSprints(project?.methodology === 'agile' ? project.id : undefined)
  const [sheet, setSheet] = useState<'edit' | 'phases' | 'task' | 'archive' | null>(null)
  const archive = useArchiveProject()
  const restore = useRestoreProject()

  if (summary.isError) {
    return (
      <>
        <PageHeader title="Project" />
        <QueryError what="Project" onRetry={() => void summary.refetch()} />
      </>
    )
  }
  if (summary.isPending || !workspace) return <PageSkeleton />
  if (!project) return <NotFound what="project" backTo={paths.projects(ws)} backLabel="Back to projects" />

  const ctx = { project, userTeamIds: me?.teamIds }
  const canEdit = check('project.edit', ctx)
  const canPhases = check('phase.manage', ctx)
  const canPost = check('collab.post', ctx)
  const canTasks = check('task.manage', ctx)
  const nameOf = (id: string) => people.find((u) => u.id === id)?.name ?? '—'

  const [statusLabel, statusTone] = statusBadge[project.status]
  const links = project.links.flatMap((l) => {
    const href = safeLink(l.url)
    return href ? [{ ...l, href }] : []
  })
  const meta: RecordMeta[] = [
    { icon: <Building2 />, label: project.clientName.trim() || '—', title: 'Client' },
    { icon: <UserRound />, label: nameOf(project.managerId), title: 'Project manager' },
    { icon: <CalendarDays />, label: `${formatDate(project.startDate)} – ${formatDate(project.dueDate)}`, title: 'Start and due' },
    ...links.map((l) => ({
      icon: <Link2 />,
      label: (
        <a href={l.href} target="_blank" rel="noopener noreferrer" className="hover:text-fg hover:underline">
          {l.label}
        </a>
      ),
      title: l.href,
    })),
  ]
  const primary: RecordAction | undefined = canTasks ? { label: 'New task', icon: Plus, onSelect: () => setSheet('task') } : undefined
  const secondary: RecordAction[] = canEdit ? [{ label: 'Edit project', icon: Pencil, onSelect: () => setSheet('edit') }] : []
  const more: RecordAction[] = [
    ...(canPhases ? [{ label: 'Manage phases', icon: Layers, onSelect: () => setSheet('phases') }] : []),
    // Archiving takes it out of every list; Admins only. An archived project is frozen, so its edits are gone above.
    ...(check('project.archive') && !project.archivedAt ? [{ label: 'Archive project', icon: Archive, onSelect: () => setSheet('archive') }] : []),
  ]

  const phaseList = phases.data ?? []
  const stages = stagesOf(phaseList, tasks.data ?? [], now)
  const currentIndex = Math.max(0, stages.findIndex((s) => s.id === project.currentPhaseId))
  const allDone = stages.length > 0 && project.currentPhaseId === null

  return (
    <>
      <RecordHeader
        avatar={<span className="grid place-items-center rounded-full bg-accent-soft font-semibold text-accent">{initials(project.name)}</span>}
        title={project.name}
        badges={
          <>
            <Badge tone={statusTone}>{statusLabel}</Badge>
            <Badge>{project.methodology === 'waterfall' ? 'Waterfall' : 'Agile'}</Badge>
            <span className="font-mono text-xs text-fg-muted">{project.key}</span>
          </>
        }
        meta={meta}
        primary={primary}
        secondary={secondary}
        more={more}
      />

      {project.archivedAt && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-muted px-4 py-3">
          <p className="text-sm text-fg-secondary">This project is archived.</p>
          {check('project.archive') && (
            <Button variant="secondary" onClick={() => restore.mutate(project.id)} disabled={restore.isPending}>
              {restore.isPending ? 'Restoring…' : 'Restore project'}
            </Button>
          )}
          {restore.error && <p className="w-full text-sm text-red-600 dark:text-red-400">{(restore.error as Error).message}</p>}
        </div>
      )}

      {phases.isError ? (
        <p className="mb-5 text-sm text-red-600 dark:text-red-400">Phases couldn't be loaded.</p>
      ) : phases.isPending ? (
        <div className="mb-5 h-11 animate-pulse rounded-lg bg-surface-muted" aria-hidden />
      ) : stages.length > 0 ? (
        <div className="mb-5">
          <StageProgress
            label="Phases"
            stages={stages}
            current={currentIndex}
            state={allDone ? 'done' : 'active'}
            renderDetails={(_, index) => {
              const s = stages[index]!
              const status = s.phase.status === 'done' ? 'Done' : s.phase.status === 'inProgress' ? 'In progress' : 'Not started'
              return (
                <div className="space-y-1.5">
                  <p className="font-semibold text-fg">{s.phase.name}</p>
                  <p className="text-fg-secondary">
                    {formatDate(s.phase.startDate)} – {formatDate(s.phase.dueDate)}
                  </p>
                  <p className="text-fg-muted">
                    {status} · {s.taskCount} {s.taskCount === 1 ? 'task' : 'tasks'}
                    {s.overdue && <span className="font-medium text-red-600 dark:text-red-400"> · Overdue</span>}
                  </p>
                </div>
              )
            }}
          />
        </div>
      ) : null}

      <ProjectTabs ws={ws} projectKey={project.key} tab={tab} />

      {tab === 'overview' && <OverviewTab project={project} phases={phaseList} people={people} teams={teams} canEdit={canEdit} canPost={canPost} />}
      {tab === 'tasks' && <TasksTab project={project} people={people} phases={phaseList} />}
      {tab === 'chat' && <ChatTab ws={ws} project={project} />}
      {tab === 'time' && <TimeTab project={project} people={people} />}
      {tab === 'history' && <HistoryTab project={project} people={people} phases={phaseList} />}
      {tab === 'files' && <FilesTab ws={ws} project={project} users={people} />}

      <RecordActionBarSpacer />

      {sheet === 'edit' && <ProjectSheet workspaceId={workspace.id} project={project} takenKeys={[]} onClose={() => setSheet(null)} onSaved={() => setSheet(null)} />}
      {sheet === 'task' && <TaskSheet project={project} phases={phaseList} sprints={sprints.data ?? []} users={people} onClose={() => setSheet(null)} />}
      {sheet === 'phases' && <PhasesSheet project={project} phases={phaseList} onClose={() => setSheet(null)} />}
      <ConfirmDeleteSheet
        open={sheet === 'archive'}
        tone="primary"
        title={`Archive ${project.name}?`}
        description="It leaves the lists and the dashboard, and nothing in it can change until it's restored. Its time stays in reports."
        actionLabel="Archive project"
        pendingLabel="Archiving…"
        askWhy
        onConfirm={(reason) => archive.mutateAsync({ id: project.id, reason })}
        onClose={() => setSheet(null)}
      />
    </>
  )
}
