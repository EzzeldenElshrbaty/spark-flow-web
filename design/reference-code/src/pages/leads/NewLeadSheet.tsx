import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { ChevronDown, Plus, TriangleAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Field, inputClass, selectClass } from '../../components/ui/Field'
import { Sheet } from '../../components/ui/Sheet'
import { toContactInput, validateContact, type ContactDraft, type ContactErrors } from '../../lib/leadRules'
import { useMarket } from '../../lib/useMarket'
import { useViewer } from '../../lib/useRole'
import { assignableReps, repLabel, channels, howHeardOptions, referralAnswers, repWorksIn, reps, type SourceType } from '../../mocks/leads'
import { canAssignLeads, leadsApi, type NewLeadInput } from '../../api/leads'
import { companyDraft, companyDraftErrors, companyDraftTouched, toCompanyDetails, type CompanyDraft } from '../../lib/companyDetails'
import { CompanyFields } from './CompanyDetails'
import { ContactFields } from './ContactFields'
import { ServicePicker } from './shared'
import { useLeadMutation } from './useLeadMutation'

type FormState = {
  company: string
  contacts: (ContactDraft & { key: number })[]
  sourceType: SourceType
  channel: string
  howHeard: string
  referredBy: string
  need: string
  services: string[]
  notes: string
  market: string
  repId: string
  companyDetails: CompanyDraft
}

type Errors = Partial<Record<Exclude<keyof FormState, 'contacts' | 'companyDetails'>, string>> & { contacts?: Record<number, ContactErrors> }

let nextContactKey = 1
const blankContact = (isPrimary: boolean) => ({ key: nextContactKey++, name: '', jobTitle: '', phone: '', email: '', note: '', isPrimary })

function validate(form: FormState): Errors {
  const errors: Errors = {}
  const contactErrors: Record<number, ContactErrors> = {}
  for (const contact of form.contacts) {
    const found = validateContact(contact, form.market)
    if (Object.keys(found).length) contactErrors[contact.key] = found
  }
  if (Object.keys(contactErrors).length) errors.contacts = contactErrors
  if (!form.channel) errors.channel = 'Choose how the lead reached us.'
  if (!form.services.length) errors.services = 'Pick at least one service.'
  if (companyDraftTouched(form.companyDetails) && !form.company.trim()) errors.company = 'Enter the company name to save its details.'
  if (Object.keys(companyDraftErrors(form.companyDetails)).length) errors.company = errors.company ?? 'Check the company details.'
  return errors
}

export function NewLeadSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <NewLeadForm onClose={onClose} /> : null
}

function NewLeadForm({ onClose }: { onClose: () => void }) {
  const viewer = useViewer()
  const { market, markets, allowedMarkets } = useMarket()
  const canAssign = canAssignLeads(viewer.role)
  // A rep's leads are in their market. Others start in the market they're viewing (or their first one).
  const ownRep = reps.find((rep) => rep.id === viewer.repId)
  const startMarket = ownRep?.market ?? market?.id ?? allowedMarkets[0].id
  const [form, setForm] = useState<FormState>({
    company: '',
    contacts: [blankContact(true)],
    sourceType: viewer.repId ? 'Outbound' : 'Inbound',
    channel: '',
    howHeard: '',
    referredBy: '',
    need: '',
    services: [],
    notes: '',
    market: startMarket,
    repId: viewer.repId ?? '',
    companyDetails: companyDraft(undefined, startMarket),
  })
  const [showCompany, setShowCompany] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [submitted, setSubmitted] = useState(false)
  // Duplicate check runs on what was typed when a contact field loses focus, not on every keystroke.
  const [dupeKey, setDupeKey] = useState({ phones: [] as string[], emails: [] as string[], company: '' })

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    const next = { ...form, [key]: value }
    setForm(next)
    if (submitted) setErrors(validate(next))
  }

  const duplicates = useQuery({
    queryKey: ['leads', 'duplicates', dupeKey],
    queryFn: () => leadsApi.findDuplicates(dupeKey),
    enabled: !!(dupeKey.phones.length || dupeKey.emails.length || dupeKey.company),
  })
  const checkDuplicates = () =>
    setDupeKey({
      phones: form.contacts.map((contact) => contact.phone).filter(Boolean),
      emails: form.contacts.map((contact) => contact.email).filter(Boolean),
      company: form.company,
    })

  const setContacts = (contacts: FormState['contacts']) => set('contacts', contacts)
  const updateContact = (key: number, contact: ContactDraft) => setContacts(form.contacts.map((item) => (item.key === key ? { ...item, ...contact } : item)))
  const makePrimary = (key: number) => setContacts(form.contacts.map((item) => ({ ...item, isPrimary: item.key === key })))
  const removeContact = (key: number) => {
    const rest = form.contacts.filter((item) => item.key !== key)
    // Removing the primary hands the role to the first remaining contact.
    setContacts(rest.some((item) => item.isPrimary) ? rest : rest.map((item, index) => ({ ...item, isPrimary: index === 0 })))
  }
  // Switching market drops a salesperson from the other market.
  const setMarket = (id: string) => {
    // The country follows the market until someone picks one.
    const country = form.companyDetails.country === companyDraft(undefined, form.market).country ? companyDraft(undefined, id).country : form.companyDetails.country
    const next = { ...form, market: id, companyDetails: { ...form.companyDetails, country } }
    const chosen = reps.find((rep) => rep.id === next.repId)
    if (next.repId && (!chosen || !repWorksIn(chosen, id))) next.repId = ''
    setForm(next)
    if (submitted) setErrors(validate(next))
  }
  const pickMarket = !ownRep && allowedMarkets.length > 1

  const create = useLeadMutation((input: NewLeadInput) => leadsApi.create(input, viewer.name), onClose)

  // Closing a form with something typed in asks first; an untouched form just closes.
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const dirty =
    !!(form.company.trim() || form.need.trim() || form.notes.trim() || form.channel || form.howHeard || form.referredBy.trim() || form.services.length) ||
    form.contacts.length > 1 ||
    companyDraftTouched(form.companyDetails) ||
    form.contacts.some((contact) => contact.name.trim() || contact.jobTitle.trim() || contact.phone.trim() || contact.email.trim() || contact.note.trim())
  const requestClose = () => (dirty ? setConfirmDiscard(true) : onClose())

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length) return
    create.mutate({
      company: form.company.trim(),
      contacts: form.contacts.map((contact) => toContactInput(contact, form.market)),
      sourceType: form.sourceType,
      channel: form.channel,
      howHeard: form.howHeard,
      referredBy: referralAnswers.includes(form.howHeard) ? form.referredBy.trim() || undefined : undefined,
      need: form.need.trim(),
      services: form.services,
      notes: form.notes.trim() || undefined,
      repId: form.repId || null,
      market: form.market,
      companyDetails: form.company.trim() ? toCompanyDetails(form.companyDetails) : undefined,
    })
  }

  const salespeople = assignableReps(form.market)

  return (
    <>
      <Sheet
        open
        onClose={requestClose}
        variant="drawer"
        title="New lead"
        description={canAssign ? 'Assign it to a salesperson now or leave it in the unassigned queue.' : 'It will be assigned to you.'}
        footer={
          <>
            <Button variant="secondary" onClick={requestClose}>
              Cancel
            </Button>
            <Button type="submit" form="new-lead-form" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Save lead'}
            </Button>
          </>
        }
      >
        <form id="new-lead-form" onSubmit={submit} noValidate className="space-y-4">
          {pickMarket && (
            <Field label="Market" required hint="Unassigned leads wait in this market's queue.">
              <select className={selectClass} value={form.market} onChange={(event) => setMarket(event.target.value)}>
                {allowedMarkets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Company" error={errors.company}>
            <input className={inputClass} value={form.company} onChange={(event) => set('company', event.target.value)} onBlur={checkDuplicates} autoComplete="off" aria-invalid={!!errors.company} />
          </Field>
          <div className="-mt-2">
            <button
              type="button"
              onClick={() => setShowCompany(!showCompany)}
              aria-expanded={showCompany}
              className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-strong"
            >
              <ChevronDown className={clsx('size-4 transition-transform', showCompany && 'rotate-180')} />
              {showCompany ? 'Hide company details' : 'Add company details'}
            </button>
            {showCompany && (
              <div className="mt-3 space-y-2 rounded-xl border border-line p-3 motion-safe:animate-fade-up sm:p-4">
                <p className="text-xs text-fg-muted">Optional. Saved on the company, so its other leads, opportunities and client page show them too.</p>
                <CompanyFields value={form.companyDetails} onChange={(value) => set('companyDetails', value)} marketId={form.market} />
              </div>
            )}
          </div>

          <fieldset className="space-y-3">
            <legend className="mb-1.5 text-sm font-medium text-fg-secondary">Contacts</legend>
            {form.contacts.map((contact) => (
              <div key={contact.key} className="motion-safe:animate-fade-up">
                <ContactFields
                  contact={contact}
                  marketId={form.market}
                  errors={errors.contacts?.[contact.key]}
                  onChange={(next) => updateContact(contact.key, next)}
                  onMakePrimary={form.contacts.length > 1 ? () => makePrimary(contact.key) : undefined}
                  onRemove={form.contacts.length > 1 ? () => removeContact(contact.key) : undefined}
                  onBlurContact={checkDuplicates}
                />
              </div>
            ))}
            <Button variant="secondary" className="w-full border-dashed" onClick={() => setContacts([...form.contacts, blankContact(false)])}>
              <Plus className="size-4" /> Add another contact
            </Button>
            <p className="text-xs text-fg-muted">The primary contact needs a phone number. Others need a phone or an email.</p>
          </fieldset>

          {!!duplicates.data?.length && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200" role="status">
              <p className="flex items-center gap-1.5 font-medium">
                <TriangleAlert className="size-4" /> This may already exist
              </p>
              <ul className="mt-1.5 space-y-1">
                {duplicates.data.map((match) => (
                  <li key={match.id}>
                    {match.company || match.contactName} exists, owned by <span className="font-medium">{match.owner}</span>{' '}
                    <span className="text-xs opacity-80">(same {match.matchedOn.join(' and ')})</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs opacity-80">You can still save it. Check with the owner first.</p>
            </div>
          )}

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-fg-secondary">Source</legend>
            <div className="inline-flex rounded-lg border border-line p-0.5">
              {(['Inbound', 'Outbound'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => set('sourceType', option)}
                  aria-pressed={form.sourceType === option}
                  className={clsx('rounded-md px-3 py-1.5 text-sm', form.sourceType === option ? 'bg-surface-muted font-medium text-fg' : 'text-fg-muted hover:text-fg')}
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Channel" required error={errors.channel}>
              <select className={selectClass} value={form.channel} onChange={(event) => set('channel', event.target.value)} aria-invalid={!!errors.channel}>
                <option value="">Choose…</option>
                {channels.map((channel) => (
                  <option key={channel}>{channel}</option>
                ))}
              </select>
            </Field>
            <Field label="How did they hear about us?">
              <select className={selectClass} value={form.howHeard} onChange={(event) => set('howHeard', event.target.value)}>
                <option value="">Choose…</option>
                {howHeardOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </Field>
          </div>
          {referralAnswers.includes(form.howHeard) && (
            <Field label="Referred by" hint="Name of the person or client who referred them.">
              <input className={inputClass} value={form.referredBy} onChange={(event) => set('referredBy', event.target.value)} />
            </Field>
          )}

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-fg-secondary">
              Services interested in<span className="text-accent"> *</span>
            </legend>
            <ServicePicker value={form.services} onChange={(services) => set('services', services)} invalid={!!errors.services} />
            {errors.services ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.services}</p>
            ) : (
              <p className="mt-1 text-xs text-fg-muted">Pick one or more. Full solution covers all of them.</p>
            )}
          </fieldset>

          <Field label="What do they need?">
            <textarea className={clsx(inputClass, 'min-h-20')} value={form.need} onChange={(event) => set('need', event.target.value)} placeholder="A short summary of the request" />
          </Field>

          {canAssign && (
            <Field label="Assign to" hint={`Salespeople in ${markets.find((item) => item.id === form.market)?.name}.`}>
              <select className={selectClass} value={form.repId} onChange={(event) => set('repId', event.target.value)}>
                <option value="">Leave unassigned</option>
                {salespeople.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {repLabel(rep)}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Notes">
            <textarea className={clsx(inputClass, 'min-h-16')} value={form.notes} onChange={(event) => set('notes', event.target.value)} />
          </Field>
        </form>
      </Sheet>
      {confirmDiscard && (
        <Sheet
          open
          onClose={() => setConfirmDiscard(false)}
          title="Discard this lead?"
          description="Your changes will be lost."
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmDiscard(false)}>
                Keep editing
              </Button>
              <Button onClick={onClose}>Discard</Button>
            </>
          }
        >
          <p className="text-sm text-fg-muted">The lead hasn't been saved yet.</p>
        </Sheet>
      )}
    </>
  )
}
