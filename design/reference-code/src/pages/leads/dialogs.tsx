import clsx from 'clsx'
import { Ban, CheckCircle2 } from 'lucide-react'
import { createElement, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Button } from '../../components/ui/Button'
import { DateTimePicker } from '../../components/ui/DateTimePicker'
import { Field, inputClass, selectClass } from '../../components/ui/Field'
import { Sheet } from '../../components/ui/Sheet'
import { toLocalInput } from '../../lib/format'
import { hasHeldMeeting, toContactInput, validateContact, type ContactDraft, type ContactErrors } from '../../lib/leadRules'
import { useMarket } from '../../lib/useMarket'
import { useViewer } from '../../lib/useRole'
import { attachmentCategories, primaryContact, assignableReps, repLabel, type LeadContact } from '../../mocks/leads'
import { leadsApi, type LeadRow } from '../../api/leads'
import { ContactFields } from './ContactFields'
import { ServicePicker } from './shared'
import { useLeadMutation } from './useLeadMutation'
import { dayIn } from '../followUps/nextStep'
import { UpdateDialog } from '../followUps/shared'
import { activityIcons } from '../../lib/activityIcons'
import { useActivityTypes } from './useActivityTypes'
import { backendOn } from '../../lib/api'
import { FileDrop } from '../../components/ui/FileDrop'
import { allowedFilesHint } from '../../lib/fileTypes'
import { useUploads } from '../../lib/useUploads'
import { useReasons } from '../opportunities/useOpportunities'

type DialogProps = { lead: LeadRow; onClose: () => void }

const daysFromNow = (days: number) => {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(10, 0, 0, 0)
  return toLocalInput(date)
}

export function SubmitFooter({ formId, label, pending, onClose, disabled }: { formId: string; label: string; pending: boolean; onClose: () => void; disabled?: boolean }) {
  return (
    <>
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" form={formId} disabled={pending || disabled}>
        {pending ? 'Saving…' : label}
      </Button>
    </>
  )
}

export function AssignDialog({ lead, onClose }: DialogProps) {
  const viewer = useViewer()
  const { markets } = useMarket()
  const [repId, setRepId] = useState(lead.repId ?? '')
  const assign = useLeadMutation((id: string) => leadsApi.assign(lead.id, id, viewer.name), onClose)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (repId) assign.mutate(repId)
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={lead.repId ? 'Change salesperson' : 'Assign salesperson'}
      description={`${primaryContact(lead).name}${lead.company ? ` · ${lead.company}` : ''}`}
      footer={<SubmitFooter formId="assign-form" label={lead.repId ? 'Reassign' : 'Assign'} pending={assign.isPending} onClose={onClose} disabled={!repId || repId === lead.repId} />}
    >
      <form id="assign-form" onSubmit={submit} className="space-y-3">
        <p className="text-sm text-fg-muted">The salesperson gets a notification. Showing salespeople in {markets.find((market) => market.id === lead.market)?.name}.</p>
        <div className="space-y-1.5" role="radiogroup" aria-label="Salesperson">
          {/* Only reps in the lead's market; moving a lead between markets isn't done by reassigning. */}
          {assignableReps(lead.market)
            .map((rep) => (
              <label
                key={rep.id}
                className={clsx('flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm', repId === rep.id ? 'border-brand-500 bg-accent-soft' : 'border-line hover:bg-surface-muted')}
              >
                <input type="radio" name="rep" value={rep.id} checked={repId === rep.id} onChange={() => setRepId(rep.id)} className="accent-brand-500" />
                <span className="flex-1 font-medium text-fg">{repLabel(rep)}</span>
                {lead.repId === rep.id && <span className="text-xs text-fg-subtle">current</span>}
              </label>
            ))}
        </div>
      </form>
    </Sheet>
  )
}

export function FollowUpDialog({ lead, onClose }: DialogProps) {
  const viewer = useViewer()
  const [date, setDate] = useState(daysFromNow(14))
  const [note, setNote] = useState('')
  const park = useLeadMutation(() => leadsApi.followUpLater(lead.id, { date: new Date(date).toISOString(), note: note.trim() }, viewer.name), onClose)
  return (
    <Sheet
      open
      onClose={onClose}
      title="Not now"
      description="Keeps the lead open but out of the active list until the date. It comes back to you then."
      footer={<SubmitFooter formId="follow-form" label="Save" pending={park.isPending} onClose={onClose} disabled={!date} />}
    >
      <form
        id="follow-form"
        onSubmit={(event) => {
          event.preventDefault()
          park.mutate(undefined)
        }}
        className="space-y-4"
      >
        <div className="flex flex-wrap gap-1.5">
          {[
            ['1 week', 7],
            ['2 weeks', 14],
            ['1 month', 30],
            ['3 months', 90],
          ].map(([label, days]) => (
            <button key={label} type="button" onClick={() => setDate(daysFromNow(days as number))} className="rounded-full border border-line px-3 py-1 text-sm text-fg-tertiary hover:bg-surface-muted">
              {label}
            </button>
          ))}
        </div>
        <Field label="Follow up on" required>
          <DateTimePicker value={date} onChange={setDate} futureOnly label="Follow up on" />
        </Field>
        <Field label="Reason or reminder">
          <input className={inputClass} value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Budget approved in January" />
        </Field>
      </form>
    </Sheet>
  )
}

export function DisqualifyDialog({ lead, onClose }: DialogProps) {
  const viewer = useViewer()
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  // Settings → Lists → Disqualify reasons.
  const disqualifyReasons = useReasons('disqualify').filter((option) => option.active)
  const disqualify = useLeadMutation(() => leadsApi.disqualify(lead.id, { reason, note: note.trim() }, viewer.name), onClose)
  return (
    <Sheet
      open
      onClose={onClose}
      title="Disqualify lead"
      description={`${primaryContact(lead).name}${lead.company ? ` · ${lead.company}` : ''}`}
      footer={<SubmitFooter formId="dq-form" label="Disqualify" pending={disqualify.isPending} onClose={onClose} disabled={!reason || (reason === 'Other' && !note.trim())} />}
    >
      <form
        id="dq-form"
        onSubmit={(event) => {
          event.preventDefault()
          disqualify.mutate(undefined)
        }}
        className="space-y-4"
      >
        <Field label="Reason" required>
          <select className={selectClass} value={reason} onChange={(event) => setReason(event.target.value)}>
            <option value="">Choose…</option>
            {disqualifyReasons.map((option) => (
              <option key={option.id}>{option.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Details" required={reason === 'Other'} hint={reason === 'Other' ? 'Required when the reason is Other.' : undefined}>
          <textarea className={clsx(inputClass, 'min-h-16')} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </form>
    </Sheet>
  )
}

/**
 * "Qualify & propose": the client wants a proposal, so the lead becomes an opportunity at Preparing proposal, with
 * the date the proposal goes to the client. A meeting first is expected, so without one there's a
 * warning; anyone can still continue and the timeline records it.
 */
export function ConvertDialog({ lead, onClose }: DialogProps) {
  const viewer = useViewer()
  const metThem = hasHeldMeeting(lead)
  const [continueAnyway, setContinueAnyway] = useState(false)
  const [proposalVia, setVia] = useState('')
  const [proposalDue, setDue] = useState('')
  const [error, setError] = useState('')
  const setProposalDue = (date: string) => {
    setDue(date)
    setError('')
  }
  const convert = useLeadMutation(() => leadsApi.convert(lead.id, { proposalDue, proposalVia }, viewer.name))

  if (convert.isSuccess) {
    return (
      <Sheet open onClose={onClose} title="Opportunity created" footer={<Button onClick={onClose}>Done</Button>}>
        <div className="flex flex-col items-center py-4 text-center">
          <CheckCircle2 className="size-10 text-emerald-600 dark:text-emerald-400" />
          <p className="mt-3 font-medium text-fg">{lead.company || primaryContact(lead).name} is now an opportunity</p>
          <p className="mt-1 text-sm text-fg-muted">The client, contacts and opportunity were created, starting at Preparing proposal.</p>
          {convert.data?.opportunityId && (
            <Link to={`/opportunities/${convert.data.opportunityId}`} className="mt-4 text-sm font-medium text-accent hover:text-accent-strong">
              Open the opportunity
            </Link>
          )}
        </div>
      </Sheet>
    )
  }

  if (!metThem && !continueAnyway) {
    return (
      <Sheet
        open
        onClose={onClose}
        title="No meeting logged yet"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => setContinueAnyway(true)}>Continue anyway</Button>
          </>
        }
      >
        <p className="text-sm text-fg-secondary">We normally meet the client (online or in person) before preparing a proposal.</p>
        <p className="mt-2 text-xs text-fg-muted">If you continue, the timeline records that it was converted without a meeting, and your manager can see it.</p>
      </Sheet>
    )
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Qualify & propose"
      description="The client wants a proposal. The lead becomes an opportunity at Preparing proposal."
      footer={<SubmitFooter formId="convert-form" label="Create opportunity" pending={convert.isPending} onClose={onClose} />}
    >
      <form
        id="convert-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (!proposalVia || !proposalDue) return setError(!proposalVia ? 'Choose how the proposal goes to the client.' : 'Choose when the proposal goes to the client.')
          setError('')
          convert.mutate(undefined)
        }}
        noValidate
        className="space-y-4"
      >
        {!metThem && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <Ban className="mt-0.5 size-4 shrink-0" /> Converting without a meeting. This is recorded on the timeline.
          </p>
        )}
        <ProposalDeliveryFields
          via={proposalVia}
          due={proposalDue}
          invalidDue={!!error && !proposalDue}
          onVia={(via) => {
            setVia(via)
            setError('')
          }}
          onDue={setProposalDue}
        />
        <p className="text-xs text-fg-muted">Creates the client and contacts (or links existing ones) and an opportunity owned by {lead.repName ?? 'the assigned salesperson'}. Everything on the lead carries over.</p>
        {(error || convert.error) && <p className="text-sm text-red-600 dark:text-red-400">{error || convert.error?.message}</p>}
      </form>
    </Sheet>
  )
}

/**
 * The lead's Update box. Besides an optional next step, it can qualify the lead in the same save: tick
 * "Qualify & propose", choose how and when the proposal goes out, and the lead becomes an opportunity.
 */
export function LeadUpdateDialog({ lead, initialType, onClose }: DialogProps & { initialType?: string }) {
  const viewer = useViewer()
  const [qualify, setQualify] = useState(false)
  const [proposalVia, setVia] = useState('')
  const [proposalDue, setDue] = useState('')
  // If the update saved but qualifying failed, a second try only qualifies (the update is already on the timeline).
  const logged = useRef(false)
  const qualifyFields = (
    <div className="space-y-4">
      {!hasHeldMeeting(lead) && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <Ban className="mt-0.5 size-4 shrink-0" /> No meeting logged yet. Unless this update is the meeting, the timeline records it as converted without a meeting.
        </p>
      )}
      <ProposalDeliveryFields via={proposalVia} due={proposalDue} onVia={setVia} onDue={setDue} />
    </div>
  )
  return (
    <UpdateDialog
      description={lead.company || primaryContact(lead).name}
      current={lead.nextAction}
      initialType={initialType}
      extraSection={
        lead.repId
          ? { title: 'Qualify & propose', hint: 'The client wants a proposal. The lead becomes an opportunity at Preparing proposal.', content: qualifyFields, open: qualify, onOpenChange: setQualify }
          : undefined
      }
      saveLabel={qualify ? 'Save and create opportunity' : 'Save'}
      validate={() => (!qualify ? undefined : !proposalVia ? 'Choose how the proposal goes to the client.' : !proposalDue ? 'Choose when the proposal goes to the client.' : undefined)}
      onSave={async (values) => {
        if (!logged.current) {
          await leadsApi.logUpdate(lead.id, values, viewer.name)
          logged.current = true
        }
        if (qualify && !values.noContact) await leadsApi.convert(lead.id, { proposalDue, proposalVia }, viewer.name)
      }}
      onClose={onClose}
    />
  )
}

/** How and when the proposal goes to the client (Qualify & propose, and a new opportunity on the client page). */
export function ProposalDeliveryFields({ via, due, invalidDue, onVia, onDue }: { via: string; due: string; invalidDue?: boolean; onVia: (via: string) => void; onDue: (date: string) => void }) {
  const types = useActivityTypes()
  const deliveryTypes = proposalDeliveryTypes.flatMap((id) => types.filter((type) => type.id === id && type.active))
  return (
    <>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-fg-secondary">
          How will you deliver it?<span className="text-accent"> *</span>
        </legend>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="How will you deliver it?">
          {deliveryTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              aria-pressed={via === type.id}
              onClick={() => onVia(type.id)}
              className={clsx('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm', via === type.id ? 'border-brand-500 bg-accent-soft font-medium text-fg' : 'border-line text-fg-tertiary hover:bg-surface-muted')}
            >
              {createElement(activityIcons[type.icon], { className: 'size-4' })}
              {type.label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-fg-secondary">
          Proposal delivery date<span className="text-accent"> *</span>
        </legend>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {proposalQuickDates.map(([label, days]) => {
              const date = dayIn(days).slice(0, 10)
              return (
                <button key={label} type="button" onClick={() => onDue(date)} className={clsx('rounded-full border px-3 py-1.5 text-sm', due === date ? 'border-brand-500 bg-accent-soft font-medium text-fg' : 'border-line text-fg-tertiary hover:bg-surface-muted')}>
                  {label}
                </button>
              )
            })}
          </div>
          <DateTimePicker value={due} onChange={onDue} dateOnly futureOnly placeholder="Choose a date" label="Proposal delivery date" invalid={invalidDue} />
        </div>
        <p className="mt-1 text-xs text-fg-muted">When the proposal goes to the client. With how you deliver it, it becomes the deal's next step, so it shows in your day and turns overdue if missed.</p>
      </fieldset>
    </>
  )
}

/** How a proposal can reach the client, in this order: in a meeting, by email or on WhatsApp. */
const proposalDeliveryTypes = ['meeting', 'email', 'whatsapp']

const proposalQuickDates: [string, number][] = [
  ['In 3 days', 3],
  ['Next week', 7],
  ['In 2 weeks', 14],
]

export function AttachmentDialog({ lead, onClose }: DialogProps) {
  const viewer = useViewer()
  const uploads = useUploads()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  // The real app uploads the files; the prototype keeps only their names and sizes.
  const attach = useLeadMutation(
    () => uploads.run((file, batch) => leadsApi.addAttachment(lead.id, { name: file.name, category, sizeKb: Math.max(1, Math.round(file.size / 1024)), note, file, batch, title: title.trim() || undefined }, viewer.name)),
    onClose,
    { closeFirst: true },
  )
  return (
    <Sheet
      open
      onClose={onClose}
      title="Add attachment"
      description="Company profile, requirements, meeting notes…"
      footer={<SubmitFooter formId="attach-form" label="Attach" pending={attach.isPending} onClose={onClose} disabled={!uploads.files.length} />}
    >
      <form
        id="attach-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (uploads.files.length) attach.mutate(undefined)
        }}
        className="space-y-4"
      >
        <Field label="Files" required hint={backendOn ? `${allowedFilesHint} each.` : "PDF, Word, images. (Prototype: the files aren't uploaded.)"}>
          <FileDrop files={uploads.files} onFiles={uploads.setFiles} progress={uploads.progress} />
        </Field>
        <Field label="Title" hint="Optional. Names this upload in the list; without one it shows the upload date.">
          <input className={inputClass} value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Site visit photos" />
        </Field>
        <Field label="Category">
          <select className={selectClass} value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">No category</option>
            {attachmentCategories.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </Field>
        <Field label="Note" hint="What the file is, or any detail worth keeping. Shows under the file and on the timeline.">
          <textarea className={clsx(inputClass, 'min-h-20')} value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Sent by their IT manager; page 3 has the screens they like" />
        </Field>
        {attach.error && <p className="text-sm text-red-600 dark:text-red-400">{attach.error.message}</p>}
      </form>
    </Sheet>
  )
}

export function ServicesDialog({ lead, onClose }: DialogProps) {
  const viewer = useViewer()
  const [services, setServices] = useState(lead.services)
  const save = useLeadMutation(() => leadsApi.updateServices(lead.id, services, viewer.name), onClose)
  const unchanged = services.length === lead.services.length && services.every((service) => lead.services.includes(service))
  return (
    <Sheet
      open
      onClose={onClose}
      title="Services interested in"
      description="Pick at least one. Full solution covers all of them."
      footer={<SubmitFooter formId="services-form" label="Save" pending={save.isPending} onClose={onClose} disabled={!services.length || unchanged} />}
    >
      <form
        id="services-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (services.length) save.mutate(undefined)
        }}
      >
        <ServicePicker value={services} onChange={setServices} invalid={!services.length} />
        {!services.length && <p className="mt-2 text-xs text-red-600 dark:text-red-400">Pick at least one service.</p>}
      </form>
    </Sheet>
  )
}

/** Add a contact, or edit one when `contact` is given. */
export function ContactDialog({ lead, contact, onClose }: DialogProps & { contact: LeadContact | null }) {
  const viewer = useViewer()
  const [draft, setDraft] = useState<ContactDraft>({
    name: contact?.name ?? '',
    jobTitle: contact?.jobTitle ?? '',
    // Shown without the market code, which the field adds back.
    phone: contact?.phone.replace(/^\+(20|966)\s*/, '') ?? '',
    email: contact?.email ?? '',
    note: contact?.note ?? '',
    isPrimary: contact?.isPrimary ?? false,
  })
  const [errors, setErrors] = useState<ContactErrors>({})
  const save = useLeadMutation(() => leadsApi.saveContact(lead.id, toContactInput(draft, lead.market), contact?.id ?? null, viewer.name), onClose)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = validateContact(draft, lead.market)
    setErrors(found)
    if (!Object.keys(found).length) save.mutate(undefined)
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={contact ? 'Edit contact' : 'Add contact'}
      description={lead.company || undefined}
      footer={<SubmitFooter formId="contact-form" label={contact ? 'Save' : 'Add contact'} pending={save.isPending} onClose={onClose} />}
    >
      <form id="contact-form" onSubmit={submit} noValidate>
        <ContactFields
          contact={draft}
          marketId={lead.market}
          errors={errors}
          onChange={setDraft}
          // The primary flag moves by making another contact primary, so only offer it when it isn't already set.
          onMakePrimary={draft.isPrimary && contact?.isPrimary ? undefined : () => setDraft({ ...draft, isPrimary: !draft.isPrimary })}
        />
      </form>
    </Sheet>
  )
}
