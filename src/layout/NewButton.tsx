import { IconFolder, IconFolderPlus, IconPlus } from '@tabler/icons-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { usePhases, useProjectSummaries } from '@/api/projects'
import { useSprints } from '@/api/tickets'
import type { ProjectSummary } from '@/api/types'
import { useUsers } from '@/api/users'
import { IconButton } from '@/components/sf/Button'
import { Menu, MenuHeading, MenuItem, MenuSeparator } from '@/components/sf/Menu'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { withInspector } from '@/lib/inspector'
import { paths } from '@/lib/paths'
import { usePermission } from '@/lib/usePermission'
import { ProjectSheet } from '@/pages/projects/ProjectSheet'
import { TaskSheet } from '@/pages/projects/TaskSheet'
import { useTaskProjects } from '@/pages/projects/useTaskProjects'

/** The task sheet for a new task in one project, with what it needs loaded. */
function NewTaskSheet({ project, workspaceId, onClose }: { project: ProjectSummary; workspaceId: string; onClose: () => void }) {
  const phases = usePhases(project.id)
  const sprints = useSprints(project.methodology === 'agile' ? project.id : undefined)
  const users = useUsers(workspaceId)
  // The new task opens in its panel on the page I'm on (UX Phase 1, 1.5): without toasts, that's how it shows.
  const [, setParams] = useSearchParams()
  return (
    <TaskSheet
      project={project}
      phases={phases.data ?? []}
      sprints={sprints.data ?? []}
      users={users.data ?? []}
      onCreated={(task) => setParams((prev) => withInspector(prev, { kind: 'ticket', key: task.key }))}
      onClose={onClose}
    />
  )
}

/** The New project sheet over the page I'm on; Save opens the new project, as on the Projects page. */
function NewProjectSheet({ workspaceId, workspaceSlug, onClose }: { workspaceId: string; workspaceSlug: string; onClose: () => void }) {
  const summaries = useProjectSummaries(workspaceId).data ?? []
  const navigate = useNavigate()
  return (
    <ProjectSheet
      workspaceId={workspaceId}
      takenKeys={summaries.map((p) => p.key)}
      onClose={onClose}
      onSaved={(project) => {
        onClose()
        navigate(paths.project(workspaceSlug, project.key))
      }}
    />
  )
}

type Picked = { kind: 'task'; project: ProjectSummary } | { kind: 'project' }

/**
 * The white button by the logo on the Projects side (spec 5.5): New project for whoever may create one (Admin, Sales),
 * then New task in each project where I may add tasks. A single choice opens its sheet at once; with none there is no
 * button.
 */
export function NewButton() {
  const { workspace } = useCurrentWorkspace()
  const mine = useTaskProjects(workspace?.id) ?? []
  const mayCreate = usePermission()('project.create')
  const [picked, setPicked] = useState<Picked | null>(null)
  if (!workspace || (mine.length === 0 && !mayCreate)) return null

  const newProject = () => setPicked({ kind: 'project' })
  const newTask = (project: ProjectSummary) => setPicked({ kind: 'task', project })
  const choices = mine.length + Number(mayCreate)
  const label = !mayCreate ? 'New task' : mine.length ? 'New task or project' : 'New project'

  const button =
    choices === 1 ? (
      <IconButton label={label} icon={IconPlus} tone="compose" className="ms-auto" onClick={() => (mayCreate ? newProject() : newTask(mine[0]))} />
    ) : (
      <span className="ms-auto">
        <Menu label={label} trigger={(props) => <IconButton {...props} label={label} icon={IconPlus} tone="compose" />}>
          {mayCreate && (
            <>
              <MenuItem icon={IconFolderPlus} onSelect={newProject}>
                New project
              </MenuItem>
              <MenuSeparator />
            </>
          )}
          <MenuHeading>New task in</MenuHeading>
          {mine.map((project) => (
            <MenuItem key={project.id} icon={IconFolder} onSelect={() => newTask(project)}>
              {project.name}
            </MenuItem>
          ))}
        </Menu>
      </span>
    )
  const close = () => setPicked(null)
  return (
    <>
      {button}
      {picked?.kind === 'task' && <NewTaskSheet project={picked.project} workspaceId={workspace.id} onClose={close} />}
      {picked?.kind === 'project' && <NewProjectSheet workspaceId={workspace.id} workspaceSlug={workspace.slug} onClose={close} />}
    </>
  )
}
