import { useId, useMemo, useState } from 'react'
import { useProjectSummaries } from '@/api/projects'
import { useAddToTaskList, useTaskList } from '@/api/taskLists'
import { useTasksOf } from '@/api/tickets'
import type { Channel, TaskView } from '@/api/types'
import { announce } from '@/components/sf/Announcer'
import { Button } from '@/components/sf/Button'
import { fieldClass as field } from '@/components/sf/field'
import { Modal } from '@/components/sf/Modal'
import { columnLabel } from '@/lib/boardColumns'
import { mentionOptions } from '@/lib/mentionQuery'
import { StatusDot } from '@/pages/chat/MessageBody'

const MINE_SHOWN = 8
const FOUND_SHOWN = 20

/**
 * Add an existing task to a channel's list (task list §6): my open tasks before I type, then the workspace's live tasks
 * whose key or a title word starts with what I typed. Each pick is added at once and marked "On the list"; Done closes.
 */
export function AddTaskDialog({ channel, me, onClose }: { channel: Channel; me: string; onClose: () => void }) {
  const ids = useId()
  const projects = useProjectSummaries(channel.workspaceId).data ?? []
  const tasks = useTasksOf(projects.map((p) => p.id)).data
  const list = useTaskList(channel.id).data
  const add = useAddToTaskList()
  const [words, setWords] = useState('')
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set())
  const [adding, setAdding] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onList = useMemo(() => new Set([...(list?.entries.map((e) => e.task.key) ?? []), ...added]), [list, added])
  const query = words.trim()
  const shown: TaskView[] = useMemo(() => {
    if (!query) return tasks.filter((t) => t.assigneeId === me && t.category !== 'done').slice(0, MINE_SHOWN)
    const keys = mentionOptions(query, { users: [], projects: [], tasks }, { only: 'task', limit: FOUND_SHOWN }).map((o) => (o.kind === 'task' ? o.key : ''))
    return keys.flatMap((key) => tasks.find((t) => t.key === key) ?? [])
  }, [query, tasks, me])

  const pick = (task: TaskView) => {
    if (onList.has(task.key) || adding) return
    setAdding(task.key)
    setError(null)
    add.mutate(
      { channelId: channel.id, taskKey: task.key },
      {
        onSuccess: () => {
          setAdded((was) => new Set(was).add(task.key))
          announce(`${task.key} added to the task list.`)
        },
        onError: (reason) => setError(reason instanceof Error ? reason.message : 'That task wasn’t added. Try again.'),
        onSettled: () => setAdding(null),
      },
    )
  }
  const projectOf = (task: TaskView) => projects.find((p) => p.id === task.projectId)

  return (
    <Modal
      open
      onClose={onClose}
      title="Add an existing task"
      footer={
        <Button touch variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <label htmlFor={`${ids}-find`} className="sf-small mb-1 block font-medium text-sf-text">
        Find a task
      </label>
      <input
        id={`${ids}-find`}
        type="search"
        className={field}
        placeholder="Key or title"
        value={words}
        onChange={(e) => (setWords(e.target.value), setError(null))}
        autoComplete="off"
      />
      {error && (
        <p role="alert" className="sf-small mt-2 text-sf-error">
          {error}
        </p>
      )}
      {!query && shown.length > 0 && (
        <p id={`${ids}-mine`} className="sf-small mt-4 mb-1 font-medium text-sf-text-secondary">
          Assigned to you
        </p>
      )}
      {query && shown.length === 0 ? (
        <p className="sf-ui mt-4 text-sf-text-secondary">No tasks match “{query}”.</p>
      ) : (
        <ul aria-label={query ? 'Tasks found' : 'Assigned to you'} className={`m-0 list-none p-0 ${query ? 'mt-3' : ''}`}>
          {shown.map((task) => {
            const there = onList.has(task.key)
            const project = projectOf(task)
            return (
              <li key={task.id}>
                <button
                  type="button"
                  // Its name reads as it shows: the key, the title, and whether it's on the list already.
                  aria-label={`${task.key} ${task.title}${there ? ' · On the list' : ''}`}
                  aria-disabled={there || adding === task.key ? true : undefined}
                  onClick={() => pick(task)}
                  className="sf-focus flex w-full items-center gap-3 rounded-sf-md px-2 py-2 text-start hover:bg-sf-surface-hover aria-disabled:cursor-default aria-disabled:hover:bg-transparent max-md:min-h-11"
                >
                  <span className="sf-meta w-16 flex-none text-sf-text-secondary tabular-nums">{task.key}</span>
                  <span className="sf-ui min-w-0 flex-1 truncate text-sf-text">{task.title}</span>
                  <span className="sf-meta flex flex-none items-center gap-1.5 text-sf-text-secondary">
                    {there ? (
                      'On the list'
                    ) : (
                      <>
                        <StatusDot category={task.category} />
                        {project ? columnLabel(project, task.status) : ''}
                      </>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
