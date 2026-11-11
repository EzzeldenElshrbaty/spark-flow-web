import { IconChevronDown, IconChevronRight, IconPlus } from '@tabler/icons-react'
import { useEffect, useId, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useProjectSummaries } from '@/api/projects'
import { useRemoveFromTaskList, useTaskList } from '@/api/taskLists'
import { useMoveTask } from '@/api/tickets'
import type { Channel, TaskListEntry, User } from '@/api/types'
import { announce } from '@/components/sf/Announcer'
import { Button } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { firstOf } from '@/lib/boardColumns'
import { withInspector } from '@/lib/inspector'
import { listCounts, orderTaskList, reopenColumn } from '@/lib/taskList'
import { usePermission } from '@/lib/usePermission'
import { useReadOnlyLine } from '@/pages/chat/useCanPost'
import { taskCheckboxId, TaskListRow } from './TaskListRow'

const CANT_TICK = 'Only the project’s manager or the task’s assignee can change its status.'
const message = (error: unknown) => (error instanceof Error ? error.message : 'Couldn’t change that. Try again.')

/**
 * A channel's Task list tab (task list spec §5): its tasks, open ones by due date and done ones folded, each live from
 * its project. Ticking moves a task to its project's first Done column, unticking to its To do column, for whoever may
 * change that task's status. Whoever may post here adds tasks (New task, Add an existing task) and removes them.
 */
export function ChannelTaskList({
  channel,
  people,
  canPost,
  onNewTask,
  onAddExisting,
}: {
  channel: Channel
  people: User[]
  /** I may post here: add and remove tasks. */
  canPost: boolean
  /** New task, where I may make tasks in some project. */
  onNewTask?: () => void
  onAddExisting?: () => void
}) {
  const list = useTaskList(channel.id)
  const projects = useProjectSummaries(channel.workspaceId).data
  const check = usePermission()
  const move = useMoveTask()
  const remove = useRemoveFromTaskList()
  const readOnly = useReadOnlyLine(channel)
  const [params, setParams] = useSearchParams()
  const [showDone, setShowDone] = useState(false)
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set())
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({})
  // Where focus goes once a tick or a removal has redrawn the list (final review): the first of these ids on the page.
  // A row that moves to the folded Done list, or leaves, would otherwise drop focus to the page.
  const ids = useId()
  const doneToggle = `${ids}-done`
  const top = `${ids}-top`
  const [focusTo, setFocusTo] = useState<readonly string[] | null>(null)
  useEffect(() => {
    if (!focusTo) return
    const target = focusTo.map((id) => document.getElementById(id)).find(Boolean)
    if (!target) return
    target.focus()
    setFocusTo(null)
  }, [focusTo, list.data])

  if (list.isError)
    return (
      <p className="sf-ui px-6 py-8 text-sf-error">
        Couldn’t load the task list.{' '}
        <button type="button" className="sf-focus font-medium underline" onClick={() => void list.refetch()}>
          Try again
        </button>
      </p>
    )
  if (!list.data) return <div aria-hidden className="mx-6 my-6 h-24 animate-pulse rounded-sf-lg bg-sf-surface-hover" />

  const entries = list.data.entries
  const { open, done } = orderTaskList(entries)
  const counts = listCounts(entries)
  const showProject = new Set(entries.map((e) => e.task.projectId)).size > 1
  const projectOf = (entry: TaskListEntry) => projects?.find((p) => p.id === entry.task.projectId)
  const nameOf = (id: string | null) => (id ? (people.find((u) => u.id === id)?.name ?? null) : null)
  const say = (key: string, sentence: string | null) =>
    setErrors((was) => {
      const next = { ...was }
      if (sentence) next[key] = sentence
      else delete next[key]
      return next
    })
  const busy = (key: string, on: boolean) =>
    setSaving((was) => {
      const next = new Set(was)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

  const cantTick = (entry: TaskListEntry) => {
    const project = projectOf(entry)
    if (!project) return CANT_TICK
    const may = check('task.manage', { project }) || check('task.updateOwnStatus', { project, taskAssigneeId: entry.task.assigneeId })
    return may ? null : CANT_TICK
  }
  /** The rows around one in its list, nearest first: where focus goes when it leaves. */
  const around = (entry: TaskListEntry) => {
    const rows = entry.task.category === 'done' ? done : open
    const at = rows.findIndex((e) => e.id === entry.id)
    return [rows[at + 1], rows[at - 1]].flatMap((e) => (e ? [taskCheckboxId(e.task.key)] : []))
  }
  const tick = (entry: TaskListEntry, toDone: boolean) => {
    const project = projectOf(entry)
    const { key } = entry.task
    if (!project || saving.has(key)) return
    busy(key, true)
    say(key, null)
    // Done folds the task away: focus goes to the next open one. Reopened, it's back in the open list: focus follows it.
    const then = toDone ? [...around(entry), doneToggle, top] : [taskCheckboxId(key), top]
    move.mutate(
      { key, status: toDone ? firstOf(project, 'done').id : reopenColumn(project), index: 0 },
      {
        onSuccess: () => {
          announce(toDone ? `${key} marked done.` : `${key} reopened.`)
          setFocusTo(then)
        },
        onError: (error) => say(key, message(error)),
        onSettled: () => busy(key, false),
      },
    )
  }
  const takeOff = (entry: TaskListEntry) => {
    const { key } = entry.task
    const then = [...around(entry), doneToggle, top]
    remove.mutate(
      { channelId: channel.id, taskKey: key },
      {
        onSuccess: () => {
          announce(`${key} removed from the task list.`)
          setFocusTo(then)
        },
        onError: (error) => say(key, message(error)),
      },
    )
  }
  const row = (entry: TaskListEntry) => {
    const { key } = entry.task
    return (
      <TaskListRow
        key={entry.id}
        entry={entry}
        assignee={nameOf(entry.task.assigneeId)}
        showProject={showProject}
        cantTick={cantTick(entry)}
        saving={saving.has(key)}
        error={errors[key] ?? null}
        link={`?${withInspector(params, { kind: 'ticket', key }).toString()}`}
        onTick={(toDone) => tick(entry, toDone)}
        onOpen={() => setParams((prev) => withInspector(prev, { kind: 'ticket', key }))}
        onRemove={canPost ? () => takeOff(entry) : undefined}
      />
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {/* The rows follow this column's width, not the screen's: the task panel beside it narrows it (final review). */}
      <div id={top} tabIndex={-1} className="@container mx-auto w-full max-w-[760px] pb-6 outline-none">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
          {entries.length > 0 && (
            <p className="sf-meta m-0 me-auto text-sf-text-secondary tabular-nums @max-[36rem]:basis-full">
              {counts.open} open · {counts.done} done
            </p>
          )}
          {canPost && onAddExisting && (
            <Button touch onClick={onAddExisting}>
              Add an existing task
            </Button>
          )}
          {canPost && onNewTask && (
            <Button touch variant="primary" icon={IconPlus} onClick={onNewTask}>
              New task
            </Button>
          )}
        </div>
        {!canPost && readOnly && <p className="sf-small m-0 px-4 pb-2 text-sf-text-secondary sm:px-6">{readOnly}</p>}
        {entries.length === 0 ? (
          <div className="px-4 py-6 sm:px-6">
            <p className="sf-ui-medium m-0 text-sf-text">No tasks on this list yet.</p>
            <p className="sf-ui m-0 mt-1 text-sf-text-secondary">Add tasks this channel is working on. Their status stays up to date.</p>
          </div>
        ) : (
          <>
            <ul aria-label="Task list" className="m-0 list-none border-t border-sf-line p-0">
              {open.map(row)}
            </ul>
            {done.length > 0 && (
              <>
                <button
                  type="button"
                  id={doneToggle}
                  aria-expanded={showDone}
                  onClick={() => setShowDone((was) => !was)}
                  className="sf-focus sf-ui-medium mt-2 flex items-center gap-1 rounded-sf-md px-4 py-2 text-sf-text-secondary hover:text-sf-text max-md:min-h-11 sm:px-6"
                >
                  <Icon icon={showDone ? IconChevronDown : IconChevronRight} size={16} flip={!showDone} />
                  Done · {done.length}
                </button>
                {showDone && (
                  <ul aria-label="Done tasks" className="m-0 list-none border-t border-sf-line p-0">
                    {done.map(row)}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
