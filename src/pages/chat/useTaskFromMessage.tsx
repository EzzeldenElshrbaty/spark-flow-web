import { IconListCheck } from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'
import { usePhases, useProjectSummaries } from '@/api/projects'
import { useSprints } from '@/api/tickets'
import type { Attachment, ChatMessage } from '@/api/types'
import { useUsers } from '@/api/users'
import { MenuItem } from '@/components/sf/Menu'
import { usePermission } from '@/lib/usePermission'
import { canMakeTask, taskDraft } from '@/pages/chat/taskDraft'
import { TaskSheet } from '@/pages/projects/TaskSheet'

/**
 * "Create task" for the messages of a project's channel, offered to whoever manages that project's tasks: the ⋯ menu
 * item, and the task sheet it opens with the message as the draft. Other channels get neither.
 */
export function useTaskFromMessage(
  channelId: string | undefined,
  workspaceId: string | undefined,
): { messageActions?: (m: ChatMessage) => ReactNode; fromFile?: (file: Attachment, message: ChatMessage) => void; sheet: ReactNode } {
  const check = usePermission()
  const project = useProjectSummaries(workspaceId).data?.find((p) => p.channelId === channelId)
  const allowed = project ? check('task.manage', { project }) : false
  const phases = usePhases(allowed ? project?.id : undefined)
  const sprints = useSprints(allowed && project?.methodology === 'agile' ? project.id : undefined)
  const users = useUsers(allowed ? workspaceId : undefined)
  // The message the task comes from, and for Create task from file (spec 6.9), the file's name as its title.
  const [from, setFrom] = useState<{ message: ChatMessage; title?: string } | null>(null)

  if (!project || !allowed) return { sheet: null }
  const messageActions = (message: ChatMessage) =>
    !canMakeTask(message) ? null : (
      <MenuItem key="task" icon={IconListCheck} onSelect={() => setFrom({ message })}>
        Create task
      </MenuItem>
    )
  const sheet = from && (
    <TaskSheet
      key={from.message.id}
      project={project}
      phases={phases.data ?? []}
      sprints={sprints.data ?? []}
      users={users.data ?? []}
      draft={{ ...taskDraft(from.message, project.id), ...(from.title && { title: from.title }) }}
      onClose={() => setFrom(null)}
    />
  )
  return { messageActions, fromFile: (file, message) => setFrom({ message, title: file.title }), sheet }
}
