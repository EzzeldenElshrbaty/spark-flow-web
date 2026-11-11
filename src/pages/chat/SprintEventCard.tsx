import { IconFlagCheck, IconPlayerPlay } from '@tabler/icons-react'
import clsx from 'clsx'
import { Link } from 'react-router'
import type { ChatMessage, SprintEvent } from '@/api/types'
import { Icon } from '@/components/sf/Icon'
import { formatWeekdayDay } from '@/lib/format'
import { paths } from '@/lib/paths'
import type { BodyContext } from '@/pages/chat/MessageBody'

const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

/** What the card says, top to bottom, from the event alone: a sprint renamed or changed since doesn't change it. */
function lines(event: SprintEvent) {
  if (event.kind === 'started') {
    return {
      title: `${event.name} started · ends ${formatWeekdayDay(event.endDate)}`,
      goal: event.goal,
      // "12 tasks · 31 points".
      detail: `${count(event.tasks, 'task')} · ${count(event.points, 'point')}`,
    }
  }
  return {
    title: `${event.name} completed · ${event.done} of ${count(event.total, 'task')} done`,
    goal: '',
    // Nothing unfinished moves nowhere, even into a new sprint that was made for it.
    detail: event.moved > 0 ? `${event.moved} moved to ${event.movedTo ?? 'the backlog'}` : '',
  }
}

/**
 * The card starting or completing a sprint posts in its project's chat. It reads its numbers from the message, never
 * from the sprint (which may have changed or gone), so it needs no data of its own. Anywhere on it opens the project's
 * Sprints view, when I can see the project; otherwise it's the same card without the link.
 */
export function SprintEventCard({ message, ctx }: { message: ChatMessage; ctx: BodyContext }) {
  const event = message.sprintEvent!
  const { title, goal, detail } = lines(event)
  const link = ctx.projectKeys.has(event.projectKey)
  const className = clsx(
    'mt-1 grid max-w-[520px] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 rounded-sf-lg border border-sf-line bg-sf-surface p-3',
    link && 'sf-focus hover:bg-sf-surface-hover',
  )
  const content = (
    <>
      <span aria-hidden className="grid size-9 place-items-center rounded-sf-md border border-sf-line bg-sf-surface-sunken text-sf-text-secondary">
        <Icon icon={event.kind === 'started' ? IconPlayerPlay : IconFlagCheck} />
      </span>
      <span className="min-w-0">
        <span dir="auto" className="block break-words font-sf text-[14px]/[20px] font-semibold text-sf-text [overflow-wrap:anywhere]">
          {title}
        </span>
        {goal && (
          <span dir="auto" className="sf-body block break-words text-sf-text [overflow-wrap:anywhere]">
            {goal}
          </span>
        )}
        {detail && (
          <span dir="auto" className="sf-small block text-sf-text-secondary tabular-nums">
            {detail}
          </span>
        )}
      </span>
    </>
  )
  return link ? (
    <Link to={paths.project(ctx.ws, event.projectKey, 'tasks', { view: 'sprints' })} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  )
}
