import type { ReactNode } from 'react'
import { useProjects, useSprints, useTicket } from '@/api/tickets'
import { useUsers } from '@/api/users'
import { Avatar } from '@/components/ui/Avatar'
import { QueryError } from '@/components/ui/QueryError'
import { InspectorFrame, InspectorSkeleton, TitleSkeleton, type InspectorBodyProps } from '@/layout/InspectorFrame'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { ApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { PriorityPill, StatusPill } from '@/pages/projects/ticketPills'
import { NotFound } from '@/pages/NotFound'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] items-center gap-3 py-2.5">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </div>
  )
}

function Person({ name }: { name: string | null }) {
  if (!name) return <>—</>
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar name={name} size="sm" />
      <span className="truncate">{name}</span>
    </span>
  )
}

/** A ticket's fields, read-only for now. Opens on any page of the workspace. */
export function TicketInspector({ ticketKey, onClose, closeTo }: { ticketKey: string } & InspectorBodyProps) {
  const { workspace } = useCurrentWorkspace()
  const ticket = useTicket(ticketKey)
  const users = useUsers(workspace?.id)
  const projects = useProjects(workspace?.id)
  const sprints = useSprints(ticket.data?.projectId)
  // A ticket of another workspace's project is not found in this one.
  const foreign = Boolean(ticket.data && projects.data && !projects.data.some((p) => p.id === ticket.data.projectId))

  const eyebrow = (
    <>
      Ticket · <bdi dir="ltr">{ticketKey}</bdi>
    </>
  )
  const title = foreign ? 'Ticket' : ticket.data && projects.data ? ticket.data.title : ticket.isPending || projects.isLoading ? <TitleSkeleton /> : 'Ticket'

  let body
  if (foreign || (ticket.error instanceof ApiError && ticket.error.status === 404)) body = <NotFound what="ticket" backTo={closeTo} backLabel="Close the ticket" />
  else if (ticket.isError) body = <QueryError what="Ticket" onRetry={() => void ticket.refetch()} />
  else if (projects.isError) body = <QueryError what="Projects" onRetry={() => void projects.refetch()} />
  else if (ticket.isPending || projects.isLoading || users.isLoading) body = <InspectorSkeleton />
  else {
    const t = ticket.data
    const nameOf = (id: string | null) => (id ? (users.data?.find((u) => u.id === id)?.name ?? 'Unknown person') : null)
    const sprint = t.sprintId ? sprints.data?.find((s) => s.id === t.sprintId) : undefined
    body = (
      <>
        <dl className="divide-y divide-line-subtle text-sm">
          <Field label="Status">
            <StatusPill status={t.status} />
          </Field>
          <Field label="Priority">
            <PriorityPill priority={t.priority} />
          </Field>
          <Field label="Assignee">
            <Person name={nameOf(t.assigneeId)} />
          </Field>
          <Field label="Reporter">
            <Person name={nameOf(t.reporterId)} />
          </Field>
          <Field label="Sprint">{t.sprintId ? (sprint?.name ?? (sprints.isLoading ? 'Loading…' : '—')) : '—'}</Field>
          <Field label="Points">
            <span className="tabular-nums">{t.storyPoints ?? '—'}</span>
          </Field>
          <Field label="Created">
            <span className="tabular-nums">{formatDate(t.createdAt)}</span>
          </Field>
          <Field label="Updated">
            <span className="tabular-nums">{formatDate(t.updatedAt)}</span>
          </Field>
        </dl>
        <h3 className="mt-5 text-xs font-medium uppercase tracking-wide text-fg-muted">Description</h3>
        <p className="mt-1.5 whitespace-pre-line break-words text-sm text-fg-secondary">{t.description.trim() || '—'}</p>
      </>
    )
  }

  return (
    <InspectorFrame label="Ticket" eyebrow={eyebrow} title={title} onClose={onClose}>
      {body}
    </InspectorFrame>
  )
}
