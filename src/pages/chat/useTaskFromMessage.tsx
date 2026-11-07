import { IconListCheck } from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'
import { usePhases, useProjectSummaries } from '@/api/projects'
import { useSprints } from '@/api/tickets'
import type { Attachment, ChatMessage } from '@/api/types'
import type { ChannelCommandUi } from '@/pages/chat/composer/useChannelCommands'
import { useUsers } from '@/api/users'
import { MenuItem } from '@/components/sf/Menu'
import { usePermission } from '@/lib/usePermission'
import { canMakeTask, taskDraft } from '@/pages/chat/taskDraft'
import { TaskSheet, type TaskDraft } from '@/pages/projects/TaskSheet'

/**
 * "Create task" for the messages of a project's channel, offered to whoever manages that project's tasks: the ⋯ menu
 * item, and the task sheet it opens with the message as the draft. Other channels get neither.
 */
export function useTaskFromMessage(
  channelId: string | undefined,
  workspaceId: string | undefined,
): {
  messageActions?: (m: ChatMessage) => ReactNode
  fromFile?: (file: Attachment, message: ChatMessage) => void
  /** /task (spec 6.8): the sheet with a title and an assignee. */
  fromCommand?: ChannelCommandUi['newTask']
  sheet: ReactNode
} {
  const check = usePermission()
  const project = useProjectSummaries(workspaceId).data?.find((p) => p.channelId === channelId)
  const allowed = project ? check('task.manage', { project }) : false
  const phases = usePhases(allowed ? project?.id : undefined)
  const sprints = useSprints(allowed && project?.methodology === 'agile' ? project.id : undefined)
  const users = useUsers(allowed ? workspaceId : undefined)
  // What the sheet starts from: a message (and for Create task from file, the file's name as its title), or /task.
  const [from, setFrom] = useState<{ key: string; draft: (projectId: string) => TaskDraft } | null>(null)
  const fromMessage = (message: ChatMessage, title?: string) => setFrom({ key: message.id, draft: (projectId) => ({ ...taskDraft(message, projectId), ...(title && { title }) }) })

  if (!project || !allowed) return { sheet: null }
  const messageActions = (message: ChatMessage) =>
    !canMakeTask(message) ? null : (
      <MenuItem key="task" icon={IconListCheck} onSelect={() => fromMessage(message)}>
        Create task
      </MenuItem>
    )
  const sheet = from && (
    <TaskSheet
      key={from.key}
      project={project}
      phases={phases.data ?? []}
      sprints={sprints.data ?? []}
      users={users.data ?? []}
      draft={from.draft(project.id)}
      onClose={() => setFrom(null)}
    />
  )
  return {
    messageActions,
    fromFile: (file, message) => fromMessage(message, file.title),
    fromCommand: {
      projectName: project.name,
      open: ({ title, assigneeId }) => setFrom({ key: `command-${Date.now()}`, draft: () => ({ title, descriptionBody: [], ...(assigneeId && { assigneeId }) }) }),
    },
    sheet,
  }
}
