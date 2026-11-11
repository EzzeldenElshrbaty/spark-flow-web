import { IconDots, IconExternalLink, IconX } from '@tabler/icons-react'
import clsx from 'clsx'
import { Link } from 'react-router'
import type { TaskListEntry } from '@/api/types'
import { Avatar } from '@/components/Avatar'
import { IconButton } from '@/components/sf/Button'
import { Menu, MenuItem } from '@/components/sf/Menu'
import { Checkbox } from '@/components/sf/Toggle'
import { formatDayMonth } from '@/lib/format'
import { StatusDot } from '@/pages/chat/MessageBody'

/** "3 Oct", "3 Oct · late", or null with no due date (a due date is a day, read in UTC). */
const dueText = (task: TaskListEntry['task']) => (task.dueAt ? `${formatDayMonth(task.dueAt, { utc: true })}${task.overdue ? ' · late' : ''}` : null)

/**
 * One task on a channel's task list (task list §5): the checkbox, the key and title (a link to the task panel), who has
 * it, when it's due, its status, its project when the list mixes them, and ⋯. On phones two lines: the title, then
 * "NEX-112 · Nour El-Sayed · 3 Oct · late · In review".
 */
export function TaskListRow({
  entry,
  assignee,
  showProject,
  cantTick,
  saving,
  error,
  link,
  onTick,
  onOpen,
  onRemove,
}: {
  entry: TaskListEntry
  /** The assignee's name, null when nobody has it. */
  assignee: string | null
  showProject: boolean
  /** Why I may not tick it, or null when I may. */
  cantTick: string | null
  saving: boolean
  error: string | null
  /** The title's link: the task panel, keeping the rest of the address. */
  link: string
  onTick: (done: boolean) => void
  onOpen: () => void
  /** Remove from list, for whoever may post here. */
  onRemove?: () => void
}) {
  const { task } = entry
  const done = task.category === 'done'
  const due = dueText(task)
  const phoneLine = [task.key, assignee, due, task.statusLabel, showProject ? task.projectKey : null].filter(Boolean).join(' · ')
  const actions = `Task actions for ${task.key}`
  return (
    <li className="border-b border-sf-line px-4 py-2 sm:px-6">
      <div className="flex items-start gap-3 md:items-center">
        <Checkbox checked={done} disabled={saving || cantTick !== null} title={cantTick ?? undefined} onChange={onTick} className="mt-0.5 flex-none max-md:touch-target md:mt-0">
          <span className="sr-only">{done ? `Reopen ${task.key}` : `Mark ${task.key} done`}</span>
        </Checkbox>
        <div className="min-w-0 flex-1 md:flex md:items-center md:gap-4">
          <div className="min-w-0 md:flex md:flex-1 md:items-baseline md:gap-2">
            <span className="sf-meta flex-none text-sf-text-secondary tabular-nums max-md:hidden">{task.key}</span>
            <Link
              to={link}
              className={clsx(
                'sf-focus sf-ui-medium min-w-0 rounded-sf-sm break-words hover:underline max-md:line-clamp-2 md:truncate',
                done ? 'text-sf-text-secondary line-through' : 'text-sf-text',
              )}
            >
              {task.title}
            </Link>
          </div>
          <span className="sf-meta flex w-40 flex-none items-center gap-2 text-sf-text-secondary max-md:hidden">
            {assignee ? (
              <>
                <Avatar name={assignee} size={24} />
                <span className="truncate">{assignee}</span>
              </>
            ) : (
              '—'
            )}
          </span>
          <span className={clsx('sf-meta w-24 flex-none tabular-nums max-md:hidden', task.overdue ? 'text-sf-error' : 'text-sf-text-secondary')}>{due ?? '—'}</span>
          <span className="sf-meta flex w-32 flex-none items-center gap-1.5 text-sf-text-secondary max-md:hidden">
            <StatusDot category={task.category} />
            <span className="truncate">{task.statusLabel}</span>
          </span>
          {showProject && <span className="sf-meta w-12 flex-none text-sf-text-secondary max-md:hidden">{task.projectKey}</span>}
          <p className="sf-meta m-0 mt-0.5 truncate text-sf-text-secondary md:hidden">{phoneLine}</p>
        </div>
        <Menu label={actions} trigger={(props) => <IconButton label={actions} icon={IconDots} size="sm" className="flex-none max-md:touch-target" {...props} />}>
          <MenuItem icon={IconExternalLink} onSelect={onOpen}>
            Open task
          </MenuItem>
          {onRemove && (
            <MenuItem icon={IconX} onSelect={onRemove}>
              Remove from list
            </MenuItem>
          )}
        </Menu>
      </div>
      {error && <p className="sf-small m-0 mt-1 ps-7 text-sf-error">{error}</p>}
    </li>
  )
}
