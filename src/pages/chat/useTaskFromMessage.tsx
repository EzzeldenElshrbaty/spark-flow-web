import { IconListCheck } from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'
import { usePhases, useProjectSummaries } from '@/api/projects'
import { useSprints } from '@/api/tickets'
import type { ChatMessage } from '@/api/types'
import { useUsers } from '@/api/users'
import { MenuItem } from '@/components/sf/Menu'
import { usePermission } from '@/lib/usePermission'
import { canMakeTask, taskDraft } from '@/pages/chat/taskDraft'
import { TaskSheet } from '@/pages/projects/TaskSheet'

/**
 * "Create task" for the messages of a project's channel, offered to whoever manages that project's tasks: the ⋯ menu
 * item, and the task sheet it opens with the message as the draft. Other channels get neither.
 */
export function useTaskFromMessage(channelId: string | undefined, workspaceId: string | undefined): { messageActions?: (m: ChatMessage) => ReactNode; sheet: ReactNode } {
  const check = usePermission()
  const project = useProjectSummaries(workspaceId).data?.find((p) => p.channelId === channelId)
  const allowed = project ? check('task.manage', { project }) : false
  const phases = usePhases(allowed ? project?.id : undefined)
  const sprints = useSprints(allowed && project?.methodology === 'agile' ? project.id : undefined)
  const users = useUsers(allowed ? workspaceId : undefined)
  const [from, setFrom] = useState<ChatMessage | null>(null)

  if (!project || !allowed) return { sheet: null }
  const messageActions = (message: ChatMessage) =>
    !canMakeTask(message) ? null : (
      <MenuItem key="task" icon={IconListCheck} onSelect={() => setFrom(message)}>
        Create task
      </MenuItem>
    )
  const sheet = from && (
    <TaskSheet
      key={from.id}
      project={project}
      phases={phases.data ?? []}
      sprints={sprints.data ?? []}
      users={users.data ?? []}
      draft={taskDraft(from, project.id)}
      onClose={() => setFrom(null)}
    />
  )
  return { messageActions, sheet }
}
