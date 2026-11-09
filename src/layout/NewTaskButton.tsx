import { IconFolder, IconPlus } from '@tabler/icons-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { usePhases } from '@/api/projects'
import { useSprints } from '@/api/tickets'
import type { ProjectSummary } from '@/api/types'
import { useUsers } from '@/api/users'
import { IconButton } from '@/components/sf/Button'
import { Menu, MenuHeading, MenuItem } from '@/components/sf/Menu'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { withInspector } from '@/lib/inspector'
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

/**
 * The white button by the logo on the Projects side (spec 5.5): New task in a project where I may add tasks.
 * One such project opens its sheet at once, several ask which first; with none there is no button.
 */
export function NewTaskButton() {
  const { workspace } = useCurrentWorkspace()
  const mine = useTaskProjects(workspace?.id) ?? []
  const [picked, setPicked] = useState<ProjectSummary | null>(null)
  if (!workspace || mine.length === 0) return null

  const button =
    mine.length === 1 ? (
      <IconButton label="New task" icon={IconPlus} tone="compose" className="ms-auto" onClick={() => setPicked(mine[0])} />
    ) : (
      <span className="ms-auto">
        <Menu label="New task in" trigger={(props) => <IconButton {...props} label="New task" icon={IconPlus} tone="compose" />}>
          <MenuHeading>New task in</MenuHeading>
          {mine.map((project) => (
            <MenuItem key={project.id} icon={IconFolder} onSelect={() => setPicked(project)}>
              {project.name}
            </MenuItem>
          ))}
        </Menu>
      </span>
    )
  return (
    <>
      {button}
      {picked && <NewTaskSheet project={picked} workspaceId={workspace.id} onClose={() => setPicked(null)} />}
    </>
  )
}
