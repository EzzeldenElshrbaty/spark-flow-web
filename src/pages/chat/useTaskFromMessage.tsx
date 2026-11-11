import { IconListCheck } from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { usePhases, useProjectSummaries } from '@/api/projects'
import { useSendQueue } from '@/api/sendQueue'
import { useSprints } from '@/api/tickets'
import type { Attachment, ChatMessage, ProjectSummary } from '@/api/types'
import type { ChannelCommandUi } from '@/pages/chat/composer/useChannelCommands'
import { useUsers } from '@/api/users'
import { MenuItem } from '@/components/sf/Menu'
import { withInspector } from '@/lib/inspector'
import { bodyText, type Body } from '@/lib/messageBody'
import { usePermission } from '@/lib/usePermission'
import { canMakeTask, taskDraft } from '@/pages/chat/taskDraft'
import { TaskSheet, type TaskDraft } from '@/pages/projects/TaskSheet'
import { useTaskProjects } from '@/pages/projects/useTaskProjects'

/**
 * What the sheet starts from, and on which project: the channel's own, or (`picked`) one from the Project field. `from`
 * is what opened it: only /task says "Created KEY" here; the Task list tab's New task just adds to the list.
 */
type Opened = { key: string; draft: TaskDraft; picked?: ProjectSummary; from: 'message' | 'command' | 'list' }

/**
 * "Create task" in chat. In a project's channel, for whoever manages that project's tasks: the ⋯ menu item, Create
 * task from file and /task, each opening the task sheet on that project. In a channel or DM with no project, /task
 * opens it on the first project I may add tasks to, with a Project field, and the new task is announced here as
 * "Created NEX-112" (its card shows under it); the ⋯ menu stays in project channels, as
 * the server takes a task's message only from its project's chat. Where /task isn't offered it says why
 * (`whyNoTask`), and nothing while the projects load.
 */
export function useTaskFromMessage(
  channelId: string | undefined,
  workspaceId: string | undefined,
  /** A channel (not a DM): what's made here goes on its task list too (task list §6, R2). */
  listed: boolean,
): {
  messageActions?: (m: ChatMessage) => ReactNode
  fromFile?: (file: Attachment, message: ChatMessage) => void
  /** /task (spec 6.8): the sheet with a title and an assignee. */
  fromCommand?: ChannelCommandUi['newTask']
  whyNoTask?: ChannelCommandUi['whyNoTask']
  /** The Task list tab's New task: an empty sheet, where /task is offered. */
  newTask?: () => void
  sheet: ReactNode
} {
  const check = usePermission()
  const projects = useProjectSummaries(workspaceId).data
  const linked = projects?.find((p) => p.channelId === channelId)
  const allowed = linked ? check('task.manage', { project: linked }) : false
  const mine = useTaskProjects(workspaceId)
  const [opened, setOpened] = useState<Opened | null>(null)
  // The channel's project loads what its sheet needs before it opens, as it always did; a picked one when picked.
  const project = opened?.picked ?? (allowed ? linked : undefined)
  const phases = usePhases(project?.id)
  const sprints = useSprints(project?.methodology === 'agile' ? project.id : undefined)
  const users = useUsers(project ? workspaceId : undefined)
  const [, setParams] = useSearchParams()
  const queue = useSendQueue()
  const announce = (channel: string, key: string) => {
    const body: Body = [{ type: 'p', children: [{ type: 'text', text: 'Created ' }, { type: 'task', key }] }]
    queue.enqueue({ clientId: crypto.randomUUID(), channelId: channel, content: bodyText(body), body })
  }

  const sheet = opened && project && (
    <TaskSheet
      key={opened.key}
      project={project}
      phases={phases.data ?? []}
      sprints={sprints.data ?? []}
      users={users.data ?? []}
      draft={opened.draft}
      // What /task and Create task make joins the list only where it may; the tab's New task is the list's own (final review).
      {...(listed && channelId && { onto: opened.from === 'list' ? { channelId } : { channelId, optional: true } })}
      {...(opened.picked && {
        projectChoice: { projects: mine ?? [], onPick: (id: string) => setOpened({ ...opened, picked: mine?.find((p) => p.id === id) ?? opened.picked }) },
      })}
      {...(opened.picked && opened.from === 'command' && {
        // Its Created card goes to the project's chat, so here it opens beside the chat (UX Phase 1, 1.5), and I say
        // "Created NEX-112" in this channel: a message like any other (Retry if it fails), shown with the task's card.
        onCreated: (task: { key: string }) => {
          setParams((prev) => withInspector(prev, { kind: 'ticket', key: task.key }))
          if (channelId) announce(channelId, task.key)
        },
      })}
      onClose={() => setOpened(null)}
    />
  )
  const commandDraft = ({ title, assigneeId }: { title: string; assigneeId: string | null }): TaskDraft => ({ title, descriptionBody: [], ...(assigneeId && { assigneeId }) })

  if (linked && !allowed) return { sheet: null, whyNoTask: `You can’t create tasks in ${linked.name}.` }
  if (linked) {
    const fromMessage = (message: ChatMessage, title?: string) =>
      setOpened({ key: message.id, draft: { ...taskDraft(message, linked.id), ...(title && { title }) }, from: 'message' })
    return {
      messageActions: (message) =>
        !canMakeTask(message) ? null : (
          <MenuItem key="task" icon={IconListCheck} onSelect={() => fromMessage(message)}>
            Create task
          </MenuItem>
        ),
      fromFile: (file, message) => fromMessage(message, file.title),
      fromCommand: { projectName: linked.name, open: (typed) => setOpened({ key: `command-${Date.now()}`, draft: commandDraft(typed), from: 'command' }) },
      newTask: () => setOpened({ key: `list-${Date.now()}`, draft: commandDraft({ title: '', assigneeId: null }), from: 'list' }),
      sheet,
    }
  }
  if (!projects || !mine) return { sheet: null }
  if (mine.length === 0) return { sheet: null, whyNoTask: '/task needs a project you can add tasks to.' }
  return {
    fromCommand: { open: (typed) => setOpened({ key: `command-${Date.now()}`, draft: commandDraft(typed), picked: mine[0], from: 'command' }) },
    newTask: () => setOpened({ key: `list-${Date.now()}`, draft: commandDraft({ title: '', assigneeId: null }), picked: mine[0], from: 'list' }),
    sheet,
  }
}
