import { IconDots, IconExternalLink, IconX } from '@tabler/icons-react'
import clsx from 'clsx'
import { useId, useState } from 'react'
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

/** The id of a task's checkbox on the list, so focus can move to it after a change (final review). */
export const taskCheckboxId = (key: string) => `task-list-check-${key}`

/**
 * One task on a channel's task list (task list §5): the checkbox, the key and title (a link to the task panel), who has
 * it, when it's due, its status, its project when the list mixes them, and ⋯. The layout follows the list's own width,
 * not the screen's (final review): from 36rem the details sit in columns and the title wraps to two lines; below, two
 * lines: the title, then "NEX-112 · Nour El-Sayed · 3 Oct · late · In review". The assignee's name shows from 44rem.
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
  const ids = useId()
  // A tap or Space on a checkbox I can't use says why on the row, as a keyboard or screen reader already hears.
  const [explain, setExplain] = useState(false)
  const { task } = entry
  const done = task.category === 'done'
  const due = dueText(task)
  const phoneLine = [task.key, assignee, due, task.statusLabel, showProject ? task.projectKey : null].filter(Boolean).join(' · ')
  const actions = `Task actions for ${task.key}`
  const message = error ?? (explain ? cantTick : null)
  return (
    <li className="border-b border-sf-line px-4 py-2 sm:px-6">
      <div className="flex items-start gap-3">
        <Checkbox
          id={taskCheckboxId(task.key)}
          checked={done}
          unavailable={saving || cantTick !== null}
          describedBy={cantTick ? `${ids}-why` : undefined}
          title={cantTick ?? undefined}
          onChange={(next) => {
            if (cantTick) setExplain(true)
            else if (!saving) onTick(next)
          }}
          className="mt-0.5 flex-none max-md:touch-target"
        >
          <span className="sr-only">{done ? `Reopen ${task.key}` : `Mark ${task.key} done`}</span>
        </Checkbox>
        {cantTick && (
          <span id={`${ids}-why`} className="sr-only">
            {cantTick}
          </span>
        )}
        <div className="min-w-0 flex-1 @min-[36rem]:flex @min-[36rem]:items-start @min-[36rem]:gap-3">
          <div className="min-w-0 line-clamp-2 break-words @min-[36rem]:flex-1">
            <span className="sf-meta me-2 text-sf-text-secondary tabular-nums @max-[36rem]:hidden">{task.key}</span>
            <Link
              to={link}
              className={clsx('sf-focus sf-ui-medium rounded-sf-sm hover:underline', done ? 'text-sf-text-secondary line-through' : 'text-sf-text')}
            >
              {task.title}
            </Link>
          </div>
          <span className="sf-meta flex w-7 flex-none items-center gap-2 text-sf-text-secondary @max-[36rem]:hidden @min-[44rem]:w-36">
            {assignee ? (
              <>
                <Avatar name={assignee} size={24} />
                <span className="truncate @max-[44rem]:sr-only">{assignee}</span>
              </>
            ) : (
              '—'
            )}
          </span>
          <span className={clsx('sf-meta w-20 flex-none tabular-nums @max-[36rem]:hidden', task.overdue ? 'text-sf-error' : 'text-sf-text-secondary')}>{due ?? '—'}</span>
          <span className="sf-meta flex w-28 flex-none items-center gap-1.5 text-sf-text-secondary @max-[36rem]:hidden">
            <StatusDot category={task.category} />
            <span className="truncate">{task.statusLabel}</span>
          </span>
          {showProject && <span className="sf-meta w-10 flex-none text-sf-text-secondary @max-[36rem]:hidden">{task.projectKey}</span>}
          <p className="sf-meta m-0 mt-0.5 truncate text-sf-text-secondary @min-[36rem]:hidden">{phoneLine}</p>
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
      {message && (
        <p role="alert" className="sf-small m-0 mt-1 ps-7 text-sf-error">
          {message}
        </p>
      )}
    </li>
  )
}
