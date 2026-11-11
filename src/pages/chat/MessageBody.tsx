import { IconSquareCheck } from '@tabler/icons-react'
import clsx from 'clsx'
import { Fragment, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import type { StatusCategory, TaskRef, User } from '@/api/types'
import { Avatar } from '@/components/Avatar'
import { Icon } from '@/components/sf/Icon'
import { Tooltip } from '@/components/sf/Tooltip'
import { withInspector } from '@/lib/inspector'
import { isJumbo, type Block, type Body, type Inline, type Mark } from '@/lib/messageBody'
import { paths } from '@/lib/paths'

/** What a body needs to show its entities: people's names, the tasks it names (as I may see them), where links go. */
export type BodyContext = {
  users: User[]
  /** Tasks by key, already filtered to projects I can see: a key that isn't here stays text. */
  tasks: Map<string, TaskRef>
  /** Project keys I can see. */
  projectKeys: Set<string>
  ws: string
  /** For actions that open a DM (the profile card). */
  workspaceId: string
}

const pill = 'rounded-sf-sm bg-sf-surface-mention px-0.5 font-medium text-sf-accent'

/** open = hollow ring, in review = warning, done = success (spec 6.3). */
function StatusDot({ category }: { category: StatusCategory }) {
  return (
    <span
      aria-hidden
      className={clsx(
        'inline-block size-2 flex-none rounded-sf-full',
        category === 'done' ? 'bg-sf-success' : category === 'inProgress' ? 'bg-sf-warning' : 'bg-transparent shadow-[inset_0_0_0_2px_var(--ink-400)]',
      )}
    />
  )
}

/** Opens a task in the inspector, keeping the rest of the page's query. */
function useTaskLink() {
  const [params] = useSearchParams()
  return (key: string) => ({ search: withInspector(params, { kind: 'ticket', key }).toString() })
}

/** A task reference (spec 6.3): mono key with a live status dot; hover shows the task, click opens it. */
export function TaskChip({ task }: { task: TaskRef }) {
  const to = useTaskLink()
  return (
    <Tooltip label={task.title} sub={`${task.key} · ${task.statusLabel} · ${task.projectName}`} describe>
      <Link
        to={to(task.key)}
        className="sf-focus inline-flex items-center gap-1 rounded-sf-sm border border-sf-line bg-sf-surface-sunken px-1 align-[1px] font-mono text-[12px]/[18px] font-medium text-sf-text hover:border-sf-line-strong"
      >
        <StatusDot category={task.category} />
        <bdi dir="ltr">{task.key}</bdi>
      </Link>
    </Tooltip>
  )
}

/**
 * A task as a card that opens it (spec 6.3): title, live status and project, the assignee. `children` is a last line
 * under them, such as what a task change did; the mention's card has none.
 */
export function TaskCard({ task, users, children }: { task: TaskRef; users: User[]; children?: ReactNode }) {
  const to = useTaskLink()
  const assignee = users.find((u) => u.id === task.assigneeId)
  return (
    <Link
      to={to(task.key)}
      className="sf-focus mt-1 grid max-w-[520px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 rounded-sf-lg border border-sf-line bg-sf-surface p-3 hover:bg-sf-surface-hover"
    >
      <span aria-hidden className="grid size-9 place-items-center rounded-sf-md border border-sf-line bg-sf-surface-sunken text-sf-text-secondary">
        <Icon icon={IconSquareCheck} />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-sf text-[14px]/[20px] font-semibold text-sf-text">{task.title}</span>
        <span className="sf-small flex items-center gap-2 text-sf-text-secondary">
          <StatusDot category={task.category} />
          <span className="truncate">
            <bdi dir="ltr">{task.key}</bdi> · {task.statusLabel} · {task.projectName}
          </span>
        </span>
        {children && <span className="mt-1.5 flex min-w-0 items-center gap-2">{children}</span>}
      </span>
      {assignee && <Avatar id={assignee.id} name={assignee.name} size={28} />}
    </Link>
  )
}

/** The first task a message names, as a card under its body (spec 6.3). */
export function TaskUnfurl({ task, users }: { task: TaskRef; users: User[] }) {
  return <TaskCard task={task} users={users} />
}

function marked(text: string, marks: Mark[] | undefined, key: number): ReactNode {
  let node: ReactNode = text
  for (const mark of marks ?? []) {
    if (mark === 'b') node = <strong className="font-semibold">{node}</strong>
    else if (mark === 'i') node = <em>{node}</em>
    else if (mark === 'u') node = <u>{node}</u>
    else if (mark === 's') node = <s>{node}</s>
    else node = <code className="sf-code rounded-sf-sm border border-sf-line bg-sf-surface-sunken px-1">{node}</code>
  }
  return <Fragment key={key}>{node}</Fragment>
}

export function Inlines({ nodes, ctx }: { nodes: Inline[]; ctx: BodyContext }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          case 'text':
            return marked(n.text, n.marks, i)
          case 'link':
            return (
              <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className="text-sf-accent hover:underline">
                {n.text}
              </a>
            )
          case 'user': {
            const user = ctx.users.find((u) => u.id === n.id)
            return user ? (
              <span key={i} className={pill}>
                @{user.name}
              </span>
            ) : (
              <Fragment key={i}>@{n.name}</Fragment>
            )
          }
          case 'all':
            return (
              <span key={i} className={pill}>
                @channel
              </span>
            )
          case 'here':
            return (
              <span key={i} className={pill}>
                @here
              </span>
            )
          case 'channel':
            return (
              <Link key={i} to={paths.channel(ctx.ws, n.id)} className="text-sf-accent hover:underline">
                #{n.name}
              </Link>
            )
          case 'task': {
            const task = ctx.tasks.get(n.key)
            return task ? <TaskChip key={i} task={task} /> : <bdi key={i} dir="ltr">{n.key}</bdi>
          }
          case 'project':
            return ctx.projectKeys.has(n.key) ? (
              <Link key={i} to={paths.project(ctx.ws, n.key)} className={`${pill} hover:underline`}>
                @<bdi dir="ltr">{n.key}</bdi>
              </Link>
            ) : (
              <Fragment key={i}>@{n.key}</Fragment>
            )
        }
      })}
    </>
  )
}

/** `tail` ("(edited)") ends the last paragraph's line; after any other last block it takes its own line. */
export function Blocks({ blocks, ctx, tail }: { blocks: Block[]; ctx: BodyContext; tail?: ReactNode }) {
  const last = blocks.length - 1
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'p')
          return (
            <p key={i} dir="auto" className="whitespace-pre-wrap">
              <Inlines nodes={b.children} ctx={ctx} />
              {i === last && tail && <> {tail}</>}
            </p>
          )
        if (b.type === 'code')
          return (
            <pre key={i} dir="ltr" className="sf-code my-1 rounded-sf-md border border-sf-line bg-sf-surface-sunken px-3 py-2 whitespace-pre-wrap">
              {b.text}
            </pre>
          )
        if (b.type === 'quote')
          return (
            <blockquote key={i} className="my-1 border-s-4 border-sf-line ps-3 text-sf-text-secondary">
              <Blocks blocks={b.children} ctx={ctx} />
            </blockquote>
          )
        const List = b.type === 'ul' ? 'ul' : 'ol'
        return (
          <List key={i} className={clsx('my-1 ps-6', b.type === 'ul' ? 'list-disc' : 'list-decimal')}>
            {b.items.map((item, j) => (
              <li key={j} dir="auto">
                <Inlines nodes={item} ctx={ctx} />
              </li>
            ))}
          </List>
        )
      })}
    </>
  )
}

/** The first task named in a body that I can see, for the unfurl. */
export function firstTask(body: Body, tasks: Map<string, TaskRef>): TaskRef | undefined {
  const inlines = (b: Block): Inline[] => (b.type === 'p' ? b.children : b.type === 'quote' ? b.children.flatMap(inlines) : b.type === 'code' ? [] : b.items.flat())
  for (const n of body.flatMap(inlines)) if (n.type === 'task' && tasks.has(n.key)) return tasks.get(n.key)
  return undefined
}

/** Every task key a body names, to look them up in one go. */
export function taskKeysOf(body: Body): string[] {
  const keys: string[] = []
  const walk = (b: Block) => {
    const nodes = b.type === 'p' ? b.children : b.type === 'ul' || b.type === 'ol' ? b.items.flat() : []
    for (const n of nodes) if (n.type === 'task') keys.push(n.key)
    if (b.type === 'quote') b.children.forEach(walk)
  }
  body.forEach(walk)
  return keys
}

/** A message's body as elements (spec 6.3); emoji alone show large. */
export function MessageBody({ body, ctx, after, muted = false }: { body: Body; ctx: BodyContext; after?: ReactNode; muted?: boolean }) {
  return (
    <div className={clsx('space-y-1 break-words [overflow-wrap:anywhere]', muted ? 'text-sf-text-muted' : 'text-sf-text', isJumbo(body) ? 'sf-emoji text-[32px]/[40px]' : 'sf-body')}>
      <Blocks blocks={body} ctx={ctx} tail={after} />
      {body[body.length - 1]?.type !== 'p' && after}
    </div>
  )
}
