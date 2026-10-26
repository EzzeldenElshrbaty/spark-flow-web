import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  ArrowLeft,
  ArrowRightCircle,
  Ban,
  Briefcase,
  Building2,
  CalendarClock,
  Check,
  Clock,
  FileText,
  Hash,
  History,
  Lock,
  Mail,
  MessageCircle,
  Paperclip,
  Pencil,
  StickyNote,
  Phone,
  Trash2,
  Plus,
  CalendarPlus,
  UserPlus,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { createElement, useState, type ReactNode } from 'react'
import { MarketIcon } from '../../layout/MarketSwitcher'
import { Link, useNavigate, useParams } from 'react-router'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader } from '../../components/ui/Card'
import { DeleteDialog } from '../../components/ui/DeleteDialog'
import { deleteApi, deletingOn } from '../../api/deleting'
import { RecordActionBarSpacer, RecordHeader } from '../../components/ui/RecordHeader'
import { StageProgress, type Stage, type StageState } from '../../components/ui/StageProgress'
import { elapsed, formatDate, formatWhen, hoursSince, timeAgo } from '../../lib/format'
import { useMarket } from '../../lib/useMarket'
import { useViewer } from '../../lib/useRole'
import { colorForType, iconForType } from '../../lib/activityIcons'
import { clientIdOf } from '../../mocks/clientsApi'
import { responseTimes } from '../../mocks/responseTimes'
import { leadStages, primaryContact, type LeadAttachment, type LeadContact, type LeadEvent } from '../../mocks/leads'
import { isLeadManager, canAssignLeads, canViewLead, canWorkLead, leadsApi, type LeadRow } from '../../api/leads'
import { CompanyDetailsCard, CompanyDetailsDialog } from './CompanyDetails'
import { AssignDialog, AttachmentDialog, ContactDialog, ConvertDialog, DisqualifyDialog, FollowUpDialog, LeadUpdateDialog, ServicesDialog } from './dialogs'
import { isHeldMeeting, isOpen, slaBreached } from '../../lib/leadRules'
import { NextStepCard, NextStepDialog, NextStepView, NoteDialog } from '../followUps/shared'
import { useLeadMutation } from './useLeadMutation'
import { useActivityTypes } from './useActivityTypes'
import { Avatar, LeadStatusBadge, ServiceChips } from './shared'
import { DocumentActions } from '../opportunities/DocumentActions'
import { RecordHistorySheet } from '../settings/RecordHistorySheet'
import { UploadGroup, UploadList } from '../../components/ui/UploadGroup'
import { groupByBatch, mergeUploadEvents } from '../../lib/uploadGroups'

type DialogKind = 'update' | 'stepUpdate' | 'next' | 'note' | 'assign' | 'convert' | 'later' | 'disqualify' | 'attach' | 'services' | 'company' | 'delete' | 'history'


export function LeadDetailPage() {
  const { id = '' } = useParams()
  const viewer = useViewer()
  const navigate = useNavigate()
  const { markets } = useMarket()
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const { data: lead, isError } = useQuery({ queryKey: ['leads', 'detail', id], queryFn: () => leadsApi.get(id), retry: false })
  const resume = useLeadMutation(() => leadsApi.resume(id, viewer.name))
  const reopen = useLeadMutation(() => leadsApi.reopen(id, viewer.name))
  const [editingContact, setEditingContact] = useState<LeadContact | 'new' | null>(null)
  const [copied, setCopied] = useState(false)
  const [fileNote, setFileNote] = useState<LeadAttachment | null>(null)
  const setPrimary = useLeadMutation((contactId: string) => leadsApi.setPrimaryContact(id, contactId, viewer.name))
  const removeContact = useLeadMutation((contactId: string) => leadsApi.removeContact(id, contactId, viewer.name))

  if (isError) return <Message title="Lead not found" text="It may have been removed, or the link is wrong." />
  if (!lead) return <div className="h-64 animate-pulse rounded-xl bg-surface-strong" />
  if (!canViewLead(viewer, lead)) return <Message title="No access" text={`The ${viewer.role} role can't open this lead.`} icon={Lock} />

  const canWork = canWorkLead(viewer, lead) && isOpen(lead)
  const canAssign = canAssignLeads(viewer.role) && isOpen(lead)
  const market = markets.find((item) => item.id === lead.market)
  const primary = primaryContact(lead)
  const phoneDigits = primary.phone.replace(/\D/g, '')
  const close = () => setDialog(null)
  const copyId = () => {
    navigator.clipboard?.writeText(lead.id).catch(() => undefined)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  const canEditContacts = canWork || canAssign
  const working = canWork && !!lead.repId

  return (
    <>
      <Link to="/leads" className="mb-4 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Leads
      </Link>

      <RecordHeader
        avatar={<Avatar name={primary.name} />}
        title={primary.name}
        badges={
          <>
            <LeadStatusBadge lead={lead} />
            {slaBreached(lead) && <span className="text-xs font-medium text-red-600 dark:text-red-400">SLA breach</span>}
          </>
        }
        meta={[
          ...(primary.jobTitle ? [{ icon: <Briefcase />, label: primary.jobTitle }] : []),
          ...(lead.company ? [{ icon: <Building2 />, label: lead.company }] : []),
          { icon: lead.repName ? <Avatar name={lead.repName} size="sm" /> : <UserRound />, label: lead.repName ?? 'Unassigned', title: 'Salesperson' },
          { icon: <MarketIcon scope={lead.market} className="size-4" />, label: market?.name, title: 'Market' },
          { icon: copied ? <Check /> : <Hash />, label: copied ? 'Copied' : lead.id, title: 'Copy the lead number', onClick: copyId },
        ]}
        primary={
          working
            ? { label: 'Add update', icon: Plus, onSelect: () => setDialog('update') }
            : canAssign && !lead.repId
              ? { label: 'Assign salesperson', icon: UserPlus, onSelect: () => setDialog('assign') }
              : undefined
        }
        secondary={
          working
            ? [
                { label: 'Qualify & propose', icon: ArrowRightCircle, onSelect: () => setDialog('convert') },
                { label: 'Add note', icon: StickyNote, onSelect: () => setDialog('note') },
              ]
            : isOpen(lead) && (canWork || canAssign)
              ? [{ label: 'Add note', icon: StickyNote, onSelect: () => setDialog('note') }]
              : []
        }
                more={[
          ...(working
            ? [
                { label: lead.nextAction ? 'Change next step' : 'Plan next step', icon: CalendarPlus, onSelect: () => setDialog('next') },
                { label: 'Not now · follow up later', icon: Clock, onSelect: () => setDialog('later') },
                { label: 'Not interested · disqualify', icon: Ban, onSelect: () => setDialog('disqualify'), danger: true },
              ]
            : []),
          ...(canAssign && lead.repId ? [{ label: 'Change salesperson', icon: UserPlus, onSelect: () => setDialog('assign') }] : []),
          ...(phoneDigits && isOpen(lead)
            ? [
                { label: `Call ${primary.name}`, icon: Phone, onSelect: () => window.open(`tel:+${phoneDigits}`, '_self') },
                { label: 'WhatsApp', icon: MessageCircle, onSelect: () => window.open(`https://wa.me/${phoneDigits}`, '_blank', 'noreferrer') },
              ]
            : []),
          ...(viewer.role === 'Management' ? [{ label: 'Change history', icon: History, onSelect: () => setDialog('history') }] : []),
          ...(viewer.role === 'Management' && deletingOn
            ? [
                {
                  label: 'Delete lead',
                  icon: Trash2,
                  onSelect: () => setDialog('delete'),
                  danger: true,
                  disabledHint: lead.opportunityId ? `It became ${lead.opportunityId}. Delete that first, or disqualify.` : undefined,
                },
              ]
            : []),
        ]}
      />

      <div className="mb-6">
        <LeadProgress
          lead={lead}
          onResume={canWork ? () => resume.mutate(undefined) : undefined}
          onReopen={isLeadManager(viewer.role) ? () => reopen.mutate(undefined) : undefined}
          onUpdate={working ? () => setDialog('update') : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          {isOpen(lead) && lead.repId && !lead.followUpOn && (
            <NextStepCard
              step={lead.nextAction}
              hint="Plan it so it shows in your day, or add an update when you've done something."
              onPlan={working ? () => setDialog('next') : undefined}
              onUpdate={working ? () => setDialog('stepUpdate') : undefined}
            />
          )}

          <Card>
            <CardHeader
              title="Timeline"
              action={
                isOpen(lead) &&
                (canWork || canAssign) && (
                  <Button variant="ghost" className="-mr-2 py-1 text-xs" onClick={() => setDialog('note')}>
                    <StickyNote className="size-3.5" /> Add note
                  </Button>
                )
              }
            />
            <ol className="space-y-0 px-5 py-4">
              {mergeUploadEvents(lead.events, lead.attachments).reverse().map((event, index, list) => (
                <TimelineItem key={event.id} event={event} last={index === list.length - 1} />
              ))}
            </ol>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader
              title={`Contacts (${lead.contacts.length})`}
              action={
                canEditContacts && (
                  <Button variant="ghost" className="-mr-2 py-1 text-xs" onClick={() => setEditingContact('new')}>
                    <Plus className="size-3.5" /> Add
                  </Button>
                )
              }
            />
            <ul className="divide-y divide-line-subtle">
              {[primary, ...lead.contacts.filter((contact) => contact !== primary)].map((contact) => (
                <ContactRow
                  key={contact.id}
                  contact={contact}
                  canEdit={canEditContacts}
                  canRemove={canEditContacts && lead.contacts.length > 1}
                  onEdit={() => setEditingContact(contact)}
                  onMakePrimary={() => setPrimary.mutate(contact.id)}
                  onRemove={() => removeContact.mutate(contact.id)}
                />
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <dl className="divide-y divide-line-subtle text-sm">
              {clientIdOf(lead.company, lead.market) && (
                <Detail label="Client">
                  <Link to={`/clients/${clientIdOf(lead.company, lead.market)}`} className="font-medium text-accent hover:text-accent-strong">
                    {lead.company}
                  </Link>
                </Detail>
              )}
              <Detail label="Source">
                {lead.sourceType} · {lead.channel}
              </Detail>
              <Detail label="Interested in">
                <span className="flex items-start justify-between gap-2">
                  <ServiceChips services={lead.services} />
                  {(canWork || canAssign) && (
                    <button type="button" onClick={() => setDialog('services')} className="shrink-0 text-xs font-medium text-accent hover:text-accent-strong">
                      Edit
                    </button>
                  )}
                </span>
              </Detail>
              <Detail label="Heard about us">{lead.howHeard || '—'}</Detail>
              {lead.referredBy && <Detail label="Referred by">{lead.referredBy}</Detail>}
              <Detail label="Need">{lead.need || '—'}</Detail>
              {lead.notes && <Detail label="Notes">{lead.notes}</Detail>}
              <Detail label="Created">
                {formatDate(lead.createdAt)} by {lead.createdBy}
              </Detail>
              {lead.assignedAt && <Detail label="Assigned">{formatWhen(lead.assignedAt)}</Detail>}
              <Detail label="First contact">
                {lead.firstContactAt && lead.assignedAt ? (
                  <FirstContact assignedAt={lead.assignedAt} firstContactAt={lead.firstContactAt} />
                ) : lead.assignedAt && isOpen(lead) ? (
                  <span className={slaBreached(lead) ? 'font-medium text-red-600 dark:text-red-400' : 'text-fg-muted'}>
                    Not yet · assigned {timeAgo(lead.assignedAt)} (target {responseTimes.firstContactHours}h)
                  </span>
                ) : (
                  '—'
                )}
              </Detail>
            </dl>
          </Card>

          {lead.company && <CompanyDetailsCard details={lead.companyDetails} onEdit={canWork ? () => setDialog('company') : undefined} />}

          <Card>
            <CardHeader
              title="Attachments"
              action={
                (canWork || canAssign) && (
                  <Button variant="ghost" className="-mr-2 py-1 text-xs" onClick={() => setDialog('attach')}>
                    <Paperclip className="size-3.5" /> Add
                  </Button>
                )
              }
            />
            {lead.attachments.length === 0 ? (
              <p className="px-5 py-4 text-sm text-fg-muted">No files yet. Add the company profile or requirements here.</p>
            ) : (
              <UploadList>
                {groupByBatch(lead.attachments).map((group) => (
<UploadGroup key={group[0].id} files={group}>
{group.map((file) => (
                  <li key={file.id} className="flex items-start gap-3 px-5 py-3">
                    <FileText className="mt-0.5 size-4 shrink-0 text-fg-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{file.name}</p>
                      <p className="text-xs text-fg-muted">
                        {[file.category, file.sizeKb >= 1024 ? `${(file.sizeKb / 1024).toFixed(1)} MB` : `${file.sizeKb} KB`, file.addedBy].filter(Boolean).join(' · ')}
                      </p>
                      <FileNote note={file.note} onEdit={canWork || canAssign ? () => setFileNote(file) : undefined} />
                    </div>
                    {file.url && <DocumentActions document={{ ...file, kind: 'file' }} siblings={lead.attachments.map((item) => ({ ...item, kind: 'file' as const }))} />}
                  </li>
))}
</UploadGroup>
))}
              </UploadList>
            )}
          </Card>
        </div>
      </div>

      <RecordActionBarSpacer />
      {(dialog === 'update' || dialog === 'stepUpdate') && (
        // "Done? Add update" on the next step starts on that step's type.
        <LeadUpdateDialog lead={lead} initialType={dialog === 'stepUpdate' ? lead.nextAction?.type : undefined} onClose={close} />
      )}
      {dialog === 'next' && <NextStepDialog current={lead.nextAction} onSave={(next) => leadsApi.setNextStep(lead.id, next, viewer.name)} onClose={close} />}
      {dialog === 'note' && <NoteDialog onSave={(text) => leadsApi.addNote(lead.id, text, viewer.name)} onClose={close} />}
      {fileNote && (
        <NoteDialog
          title="Note on file"
          hint={fileNote.name}
          initial={fileNote.note}
          onSave={(text) => leadsApi.updateAttachmentNote(lead.id, fileNote.id, text, viewer.name)}
          onClose={() => setFileNote(null)}
        />
      )}
      {dialog === 'assign' && <AssignDialog lead={lead} onClose={close} />}
      {dialog === 'convert' && <ConvertDialog lead={lead} onClose={close} />}
      {dialog === 'later' && <FollowUpDialog lead={lead} onClose={close} />}
      {dialog === 'disqualify' && <DisqualifyDialog lead={lead} onClose={close} />}
      {dialog === 'history' && <RecordHistorySheet recordRef={lead.id} open onClose={close} />}
      {dialog === 'delete' && (
        <DeleteDialog
          title="Delete lead"
          description={`${lead.id}${lead.company ? ` · ${lead.company}` : ''}`}
          confirmText={lead.id}
          removes={[
            'The lead, its contacts, timeline and files.',
            'Its client too, if nothing else is on it.',
            `The number ${lead.id} is not used again.`,
          ]}
          onDelete={async (confirm) => {
            await deleteApi.lead(lead.id, confirm)
            navigate('/leads', { replace: true })
          }}
          onClose={close}
        />
      )}
      {dialog === 'attach' && <AttachmentDialog lead={lead} onClose={close} />}
      {dialog === 'services' && <ServicesDialog lead={lead} onClose={close} />}
      {dialog === 'company' && (
        <CompanyDetailsDialog
          company={lead.company}
          details={lead.companyDetails}
          marketId={lead.market}
          onSave={(details) => leadsApi.updateCompany(lead.id, details, viewer.name)}
          onClose={close}
        />
      )}
      {editingContact && <ContactDialog lead={lead} contact={editingContact === 'new' ? null : editingContact} onClose={() => setEditingContact(null)} />}
    </>
  )
}

/** The lead's stage on the shared progress track, with a tag for converted, parked or disqualified leads. */
function LeadProgress({ lead, onResume, onReopen, onUpdate }: { lead: LeadRow; onResume?: () => void; onReopen?: () => void; onUpdate?: () => void }) {
  const convertedAt = lead.events.find((event) => event.text.includes('Converted to opportunity'))?.at
  const firstMeeting = lead.events.find(isHeldMeeting)
  const reached = Math.max(0, leadStages.indexOf(lead.status === 'Disqualified' ? (lead.statusBeforeDisqualify ?? 'New') : lead.status))
  // When each stage was entered; the current one shows how long it has been there.
  const enteredAt = [lead.createdAt, lead.assignedAt, lead.firstContactAt, firstMeeting?.at, convertedAt]
  // Who moved the lead into each stage, from the timeline.
  const byWhom = (match: string) => [...lead.events].reverse().find((event) => event.text.includes(match))?.by
  const enteredBy = [lead.createdBy, byWhom('Assigned to') ?? byWhom('Reassigned'), byWhom('Moved to Contacted') ?? lead.repName ?? undefined, firstMeeting?.by, byWhom('Converted to opportunity')]
  const stages: Stage[] = leadStages.map((stage, index) => {
    const at = enteredAt[index]
    const label = stage === 'New' && !lead.repId && index === reached ? 'Unassigned' : stage
    const isCurrent = index === reached && isOpen(lead)
    return { id: stage, label, meta: at ? (isCurrent ? `${elapsed(at)} in stage` : timeAgo(at)) : undefined }
  })

  const tagClass = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium'
  let state: StageState = 'active'
  let tag: ReactNode = null
  if (lead.status === 'Qualified') {
    state = 'done'
    tag = (
      <Link to={lead.opportunityId ? `/opportunities/${lead.opportunityId}` : '/opportunities'} className={clsx(tagClass, 'bg-emerald-50 text-emerald-700 hover:underline dark:bg-emerald-500/15 dark:text-emerald-300')}>
        <Check className="size-3.5" /> Converted · open opportunity
      </Link>
    )
  } else if (lead.status === 'Disqualified') {
    state = 'stopped'
    tag = (
      <span className="flex flex-wrap items-center justify-end gap-2">
        <span className={clsx(tagClass, 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300')}>
          <Ban className="size-3.5" /> Disqualified · {lead.disqualifyReason}
        </span>
        {onReopen && (
          <button type="button" onClick={onReopen} className="text-xs font-medium text-accent hover:text-accent-strong">
            Reopen
          </button>
        )}
      </span>
    )
  } else if (lead.followUpOn) {
    state = 'paused'
    tag = (
      <span className="flex flex-wrap items-center justify-end gap-2">
        <span className={clsx(tagClass, 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300')}>
          <Clock className="size-3.5" /> Not now · back {formatWhen(lead.followUpOn)}
        </span>
        {onResume && (
          <button type="button" onClick={onResume} className="text-xs font-medium text-accent hover:text-accent-strong">
            Bring back now
          </button>
        )}
      </span>
    )
  }

  const renderDetails = (stage: Stage, index: number) => {
    const at = enteredAt[index]
    const isCurrent = index === reached && isOpen(lead)
    if (!at) return <p className="text-fg-muted">{stage.label} hasn't been reached yet.</p>
    // Time in a finished stage runs until the next one started; the current one runs until now.
    const nextAt = enteredAt.slice(index + 1).find(Boolean)
    const spent = nextAt ? elapsed(at, new Date(nextAt).getTime()) : elapsed(at)
    return (
      <div className="space-y-2">
        <p className="font-semibold text-fg">{stage.label}</p>
        <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-xs">
          <dt className="text-fg-muted">Entered</dt>
          <dd className="text-fg">{formatWhen(at)}</dd>
          {enteredBy[index] && (
            <>
              <dt className="text-fg-muted">By</dt>
              <dd className="text-fg">{enteredBy[index]}</dd>
            </>
          )}
          <dt className="text-fg-muted">{isCurrent ? 'In stage for' : 'Time spent'}</dt>
          <dd className="text-fg">{spent}</dd>
        </dl>
        {isCurrent && (
          <div className="border-t border-line-subtle pt-2">
            <p className="mb-1 text-xs text-fg-muted">Next step</p>
            <NextStepView step={lead.nextAction} />
            {onUpdate && (
              <Button className="mt-3 w-full py-1.5 text-xs" onClick={onUpdate}>
                <Plus className="size-3.5" /> Add update
              </Button>
            )}
          </div>
        )}
      </div>
    )
  }

  return <StageProgress stages={stages} current={reached} state={state} tag={tag} label="Lead stage" stopLabel="Disqualified" renderDetails={renderDetails} />
}

/** `source` adds where the entry came from, e.g. a link to its lead or opportunity on the client page. */
export function TimelineItem({ event, last, source }: { event: LeadEvent; last: boolean; source?: ReactNode }) {
  const types = useActivityTypes()
  const type = types.find((item) => item.id === event.activityType)
  const icon = event.kind === 'activity' ? iconForType(event.activityType, types) : event.kind === 'note' ? StickyNote : CalendarClock
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {!last && <span className="absolute left-4 top-8 -ml-px h-[calc(100%-2rem)] w-px bg-line" aria-hidden />}
      <span
        className={clsx(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          event.kind === 'activity' ? clsx('ring-1 ring-inset', colorForType(event.activityType, types).pill) : event.kind === 'note' ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-surface-muted text-fg-muted',
        )}
      >
        {createElement(icon, { className: 'size-4' })}
      </span>
      <div className="min-w-0 flex-1 break-words pt-1">
        {event.kind === 'system' ? (
          <p className="text-sm text-fg-secondary">{event.text}</p>
        ) : (
          <>
            {/* Types switched off in Settings still show on past updates, greyed. */}
            <p className={clsx('flex items-center gap-2 text-sm font-medium', type && !type.active ? 'text-fg-muted' : 'text-fg')}>
              {event.kind === 'note' ? 'Note' : (type?.label ?? event.activityType)}
              {event.noContact && <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-fg-tertiary">Didn't reach</span>}
            </p>
            <p className="mt-0.5 whitespace-pre-line text-sm text-fg-secondary">{event.text}</p>
          </>
        )}
        {event.detail && <p className="mt-1 whitespace-pre-line rounded-md bg-surface-sunken px-2 py-1 text-xs text-fg-tertiary">{event.detail}</p>}
        <p className="mt-0.5 text-xs text-fg-muted">
          {event.by} · {formatWhen(event.at)}
          {source && <> · {source}</>}
        </p>
      </div>
    </li>
  )
}

/** The note under a file or document, with Edit (or "Add a note") for people who can change it. */
export function FileNote({ note, onEdit }: { note?: string; onEdit?: () => void }) {
  if (!note && !onEdit) return null
  return (
    <div className="mt-1.5">
      {note && <p className="whitespace-pre-line rounded-md bg-surface-sunken px-2 py-1 text-xs text-fg-tertiary">{note}</p>}
      {onEdit && (
        <button type="button" onClick={onEdit} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent hover:text-accent-strong">
          <Pencil className="size-3" /> {note ? 'Edit note' : 'Add a note'}
        </button>
      )}
    </div>
  )
}

function FirstContact({ assignedAt, firstContactAt }: { assignedAt: string; firstContactAt: string }) {
  const hours = hoursSince(assignedAt) - hoursSince(firstContactAt)
  const late = hours > responseTimes.firstContactHours
  return (
    <span className={late ? 'text-red-600 dark:text-red-400' : 'text-fg'}>
      {formatWhen(firstContactAt)} · {hours < 1 ? `${Math.max(1, Math.round(hours * 60))} min` : `${hours.toFixed(1)}h`} after assignment
    </span>
  )
}

export function ContactRow({
  contact,
  canEdit,
  canRemove,
  onEdit,
  onMakePrimary,
  onRemove,
}: {
  contact: LeadContact
  canEdit: boolean
  canRemove: boolean
  onEdit: () => void
  onMakePrimary: () => void
  onRemove: () => void
}) {
  const digits = contact.phone.replace(/\D/g, '')
  const action = 'rounded-lg border border-line p-1.5 text-fg-tertiary transition-colors hover:bg-surface-muted hover:text-fg'
  return (
    <li className="px-5 py-3.5 motion-safe:animate-fade-in">
      <div className="flex items-start gap-3">
        <Avatar name={contact.name} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-medium text-fg">{contact.name}</span>
            {contact.isPrimary && <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent">Primary</span>}
          </p>
          {contact.jobTitle && <p className="text-xs text-fg-muted">{contact.jobTitle}</p>}
          <p className="mt-1 truncate text-xs text-fg-secondary">{contact.phone || 'No phone'}</p>
          <p className="truncate text-xs text-fg-secondary">{contact.email || 'No email'}</p>
          {contact.note && <p className="mt-1.5 rounded-md bg-surface-sunken px-2 py-1 text-xs text-fg-tertiary">{contact.note}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          {digits && (
            <>
              <a href={`tel:+${digits}`} className={action} aria-label={`Call ${contact.name}`}>
                <Phone className="size-3.5" />
              </a>
              <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer" className={action} aria-label={`WhatsApp ${contact.name}`}>
                <MessageCircle className="size-3.5" />
              </a>
            </>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`} className={action} aria-label={`Email ${contact.name}`}>
              <Mail className="size-3.5" />
            </a>
          )}
        </div>
      </div>
      {canEdit && (
        <div className="mt-2 flex gap-3 pl-12 text-xs font-medium">
          <button type="button" onClick={onEdit} className="text-accent hover:text-accent-strong">
            Edit
          </button>
          {!contact.isPrimary && (
            <button type="button" onClick={onMakePrimary} className="text-accent hover:text-accent-strong">
              Make primary
            </button>
          )}
          {canRemove && (
            <button type="button" onClick={onRemove} className="text-fg-muted hover:text-red-600 dark:hover:text-red-400">
              Remove
            </button>
          )}
        </div>
      )}
    </li>
  )
}

export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 px-5 py-2.5">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </div>
  )
}

function Message({ title, text, icon: Icon = FileText }: { title: string; text: string; icon?: LucideIcon }) {
  return (
    <Card className="mx-auto mt-10 max-w-md p-8 text-center">
      <Icon className="mx-auto size-8 text-fg-subtle" />
      <h1 className="mt-3 text-lg font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-fg-muted">{text}</p>
      <Link to="/leads" className="mt-4 inline-block text-sm font-medium text-accent hover:text-accent-strong">
        Back to leads
      </Link>
    </Card>
  )
}
