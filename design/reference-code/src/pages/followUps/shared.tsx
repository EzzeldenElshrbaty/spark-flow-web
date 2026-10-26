// The follow-up pieces leads and opportunities share: the Update box (what you did, what happened, and
// an optional next step), the next step on its own, notes, and how a next step reads in lists.
import clsx from 'clsx'
import { AlarmClock, CalendarClock, ChevronDown, CircleDashed } from 'lucide-react'
import { createElement, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '../../components/ui/Button'
import { DateTimePicker } from '../../components/ui/DateTimePicker'
import { Field, inputClass } from '../../components/ui/Field'
import { Sheet } from '../../components/ui/Sheet'
import { activityIcons, colorForType, iconForType } from '../../lib/activityIcons'
import { formatDue, isPast, isToday, timeAgo } from '../../lib/format'
import type { LeadEvent, NextStep } from '../../mocks/leads'
import { useActivityTypes } from '../leads/useActivityTypes'
import { draftFrom, emptyNextStep, toNextStep, useFollowUpMutation, dayIn, type NextStepDraft } from './nextStep'

const quickDates: [string, number][] = [
  ['Tomorrow', 1],
  ['In 3 days', 3],
  ['Next week', 7],
]

const chip = (selected: boolean) =>
  clsx('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40', selected ? 'border-brand-500 bg-accent-soft font-medium text-fg' : 'border-line text-fg-tertiary hover:bg-surface-muted')

/** Call / WhatsApp / Meeting / Email as tap targets. `allowNone` lets a second tap clear the choice. */
export function TypeChips({ value, onChange, label, allowNone = false }: { value: string; onChange: (type: string) => void; label: string; allowNone?: boolean }) {
  const types = useActivityTypes().filter((type) => type.active || type.id === value)
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {types.map((type) => (
        <button key={type.id} type="button" aria-pressed={value === type.id} onClick={() => onChange(allowNone && value === type.id ? '' : type.id)} className={chip(value === type.id)}>
          {createElement(activityIcons[type.icon], { className: 'size-4' })}
          {type.label}
        </button>
      ))}
    </div>
  )
}

/** The optional next step: how (pick one to start), when, and a short note. */
export function NextStepFields({ value, onChange }: { value: NextStepDraft; onChange: (draft: NextStepDraft) => void }) {
  const set = (changes: Partial<NextStepDraft>) => onChange({ ...value, ...changes })
  return (
    <div className="space-y-3">
      <TypeChips label="Next step" value={value.type} allowNone onChange={(type) => (type ? set({ type, due: value.due || dayIn(1) }) : onChange(emptyNextStep))} />
      {value.type && (
        <div className="space-y-3 motion-safe:animate-fade-in">
          <div className="flex flex-wrap gap-1.5">
            {quickDates.map(([label, days]) => (
              <button key={label} type="button" onClick={() => set({ due: dayIn(days) })} className={chip(quickDates.find(([, other]) => dayIn(other) === value.due)?.[1] === days)}>
                {label}
              </button>
            ))}
          </div>
          <DateTimePicker value={value.due} onChange={(due) => set({ due })} futureOnly label="Next step date" />
          <input className={inputClass} value={value.note} onChange={(event) => set({ note: event.target.value })} placeholder="Note (optional), e.g. Send the revised prices" aria-label="Next step note" />
        </div>
      )}
    </div>
  )
}

export type UpdateValues = { type: string; text: string; noContact?: string; next?: NextStep }

/**
 * The Update box: what you did, what happened, and (optionally) what's next. Saving replaces the current
 * next step, so leaving it empty means nothing is planned yet; those records show under "No next step".
 */
export function UpdateDialog({
  title = 'Add update',
  description,
  current,
  initialType,
  textOptional = false,
  validate,
  children,
  saveLabel = 'Save',
  extraSection,
  onSave,
  onClose,
}: {
  title?: string
  description?: string
  /** The next step this update replaces. */
  current?: NextStep
  /** Starts on this type, e.g. the next step's when it's marked done. */
  initialType?: string
  /** "What happened" may be left empty (e.g. when the update only records that the proposal went out). */
  textOptional?: boolean
  /** Extra checks before saving (e.g. a required tick); returns what's missing. */
  validate?: () => string | undefined
  /** Extra fields under "What happened" (e.g. "The client replied"). */
  children?: ReactNode
  saveLabel?: string
  /**
   * A second optional choice beside the next step (e.g. "Qualify & propose" on a lead). The two then show as an
   * accordion, one open at a time; the next step is saved only while its section is open.
   */
  extraSection?: ExtraSection
  onSave: (values: UpdateValues) => Promise<unknown>
  onClose: () => void
}) {
  const types = useActivityTypes().filter((type) => type.active)
  // The types may still be loading when the box opens, so the starting type is checked once they're here.
  const [chosenType, setChosenType] = useState(initialType ?? '')
  const type = types.some((item) => item.id === chosenType) ? chosenType : (types[0]?.id ?? '')
  const picks = types.find((item) => item.id === type)?.noContactPicks ?? []
  // A "didn't reach them" pick (No answer, Wrong number…) is the whole update; details become optional.
  const [noContact, setNoContact] = useState('')
  const [text, setText] = useState('')
  const [next, setNext] = useState<NextStepDraft>(emptyNextStep)
  const [nextOpen, setNextOpen] = useState(!extraSection)
  const extraOpen = !!extraSection?.open
  const toggleNext = () => {
    if (!nextOpen) extraSection?.onOpenChange(false)
    setNextOpen(!nextOpen)
  }
  const toggleExtra = () => {
    if (!extraOpen) setNextOpen(false)
    extraSection?.onOpenChange(!extraOpen)
  }
  const [error, setError] = useState('')
  const save = useFollowUpMutation(() => onSave({ type, text: text.trim(), noContact: noContact || undefined, next: nextOpen ? toNextStep(next) : undefined }), onClose)
  const setType = (id: string) => {
    setChosenType(id)
    setNoContact('')
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim() && !noContact && !textOptional) return setError('Write what happened, or pick one of the quick options.')
    const missing = validate?.()
    if (missing) return setError(missing)
    setError('')
    save.mutate(undefined)
  }

  return (
    <Sheet open onClose={onClose} title={title} description={description} footer={<Footer formId="update-form" label={saveLabel} pending={save.isPending} onClose={onClose} />}>
      <form id="update-form" onSubmit={submit} noValidate className="space-y-5">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-fg-secondary">What did you do?</legend>
          <TypeChips label="What did you do?" value={type} onChange={setType} />
          {picks.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Didn't reach them">
              <span className="mr-1 text-xs text-fg-muted">Didn't reach them?</span>
              {picks.map((pick) => (
                <button key={pick} type="button" aria-pressed={noContact === pick} onClick={() => {
                    setNoContact(noContact === pick ? '' : pick)
                    // A try that didn't reach them can't qualify the lead.
                    extraSection?.onOpenChange(false)
                  }} className={clsx(chip(noContact === pick), 'px-2.5 py-1 text-xs')}>
                  {pick}
                </button>
              ))}
            </div>
          )}
        </fieldset>
        <Field label={noContact ? 'Details' : 'What happened?'} required={!noContact && !textOptional} hint={noContact ? "Optional. This try doesn't count as contact." : textOptional ? 'Optional.' : undefined}>
          <textarea
            className={clsx(inputClass, noContact ? 'min-h-16' : 'min-h-24')}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={noContact ? 'e.g. Left a voice note, will try again tomorrow' : "e.g. Met the owner. Liked the demo, waiting for their IT manager's feedback."}
            aria-invalid={!!error && !text.trim() && !noContact && !textOptional}
            autoFocus
          />
        </Field>
        {!noContact && children}
        {extraSection ? (
          <div className="divide-y divide-line rounded-lg border border-line">
            <AccordionSection title="Next step" hint={nextOpen ? undefined : 'Plan what comes next.'} open={nextOpen} onToggle={toggleNext}>
              <NextStepFields value={next} onChange={setNext} />
              <p className="mt-2 text-xs text-fg-muted">
                {current ? (
                  <>
                    {noContact ? 'Leave empty to keep' : 'Replaces'} the current next step (<NextStepInline step={current} />
                    ).
                  </>
                ) : (
                  'Leave it empty if nothing is planned yet.'
                )}
              </p>
            </AccordionSection>
            {!noContact && (
              <AccordionSection title={extraSection.title} hint={extraSection.hint} open={extraOpen} onToggle={toggleExtra}>
                {extraSection.content}
              </AccordionSection>
            )}
          </div>
        ) : (
          <fieldset className="rounded-lg border border-line p-3">
            <legend className="px-1 text-sm font-medium text-fg-secondary">
              Next step <span className="font-normal text-fg-muted">(optional)</span>
            </legend>
            <NextStepFields value={next} onChange={setNext} />
            <p className="mt-2 text-xs text-fg-muted">
              {current ? (
                <>
                  {noContact ? 'Leave empty to keep' : 'Replaces'} the current next step (<NextStepInline step={current} />
                  ).
                </>
              ) : (
                'Leave it empty if nothing is planned yet.'
              )}
            </p>
          </fieldset>
        )}
        <ErrorText>{error || save.error?.message}</ErrorText>
      </form>
    </Sheet>
  )
}

export type ExtraSection = { title: string; hint: string; content: ReactNode; open: boolean; onOpenChange: (open: boolean) => void }

/** One optional part of the Update box that opens and closes; its header says what it is. */
function AccordionSection({ title, hint, open, onToggle, children }: { title: string; hint?: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section>
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-fg-secondary">
            {title} <span className="font-normal text-fg-muted">(optional)</span>
          </span>
          {hint && <span className="block text-xs text-fg-muted">{hint}</span>}
        </span>
        <ChevronDown className={clsx('size-4 shrink-0 text-fg-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="px-3 pb-3 motion-safe:animate-fade-in">{children}</div>}
    </section>
  )
}

/** Plan, change or clear the next step without writing an update. */
export function NextStepDialog({ current, onSave, onClose }: { current?: NextStep; onSave: (next: NextStep | null) => Promise<unknown>; onClose: () => void }) {
  const [draft, setDraft] = useState(() => draftFrom(current))
  const [error, setError] = useState('')
  const save = useFollowUpMutation((next: NextStep | null) => onSave(next), onClose)
  return (
    <Sheet
      open
      onClose={onClose}
      title={current ? 'Change next step' : 'Plan next step'}
      description="It shows in your day and calendar on that date."
      footer={
        <>
          {current && (
            <Button variant="secondary" className="mr-auto" onClick={() => save.mutate(null)} disabled={save.isPending}>
              Remove
            </Button>
          )}
          <Footer formId="next-form" label="Save" pending={save.isPending} onClose={onClose} />
        </>
      }
    >
      <form
        id="next-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          const next = toNextStep(draft)
          if (!next) return setError('Pick how and when.')
          setError('')
          save.mutate(next)
        }}
        className="space-y-3"
      >
        <NextStepFields value={draft} onChange={setDraft} />
        <ErrorText>{error || save.error?.message}</ErrorText>
      </form>
    </Sheet>
  )
}

/** A note on the timeline: anything worth writing down, at any stage. */
export function NoteDialog({ onSave, onClose, title = 'Add note', initial = '', hint }: { onSave: (text: string) => Promise<unknown>; onClose: () => void; title?: string; initial?: string; hint?: string }) {
  const [text, setText] = useState(initial)
  const save = useFollowUpMutation(() => onSave(text), onClose)
  return (
    <Sheet open onClose={onClose} title={title} description={hint} footer={<Footer formId="note-form" label="Save" pending={save.isPending} onClose={onClose} />}>
      <form
        id="note-form"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate(undefined)
        }}
      >
        <textarea className={clsx(inputClass, 'min-h-32')} value={text} onChange={(event) => setText(event.target.value)} placeholder="Write anything you want to keep on the timeline" aria-label="Note" autoFocus />
        <ErrorText>{save.error?.message}</ErrorText>
      </form>
    </Sheet>
  )
}

function Footer({ formId, label, pending, onClose }: { formId: string; label: string; pending: boolean; onClose: () => void }) {
  return (
    <>
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" form={formId} disabled={pending}>
        {pending ? 'Saving…' : label}
      </Button>
    </>
  )
}

function ErrorText({ children }: { children: ReactNode }) {
  return children ? <p className="text-sm text-red-600 dark:text-red-400">{children}</p> : null
}

/** "Call · Send the prices" in running text. */
export function NextStepInline({ step }: { step: NextStep }) {
  const types = useActivityTypes()
  const label = types.find((type) => type.id === step.type)?.label ?? 'Follow up'
  return (
    <>
      {label}
      {step.note ? ` · ${step.note}` : ''} · {formatDue(step.due)}
    </>
  )
}

/** The grey tag records get when nobody has planned what's next. */
export function NoNextStepTag({ className }: { className?: string }) {
  return (
    <span className={clsx('inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-md bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-fg-tertiary', className)}>
      <CircleDashed className="size-3" /> No next step
    </span>
  )
}

/**
 * A next step in a list or card: the type's icon and label with the note, and when, red once overdue and
 * amber when due today. `compact` keeps it to one line.
 */
/** An activity type as a colored pill: icon and label ("Meeting"), or a count ("2 Meetings"). */
export function TypePill({ typeId, children, className }: { typeId: string | undefined; children?: ReactNode; className?: string }) {
  const types = useActivityTypes()
  const label = types.find((type) => type.id === typeId)?.label ?? 'Follow up'
  return (
    <span className={clsx('inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset', colorForType(typeId, types).pill, className)}>
      {createElement(iconForType(typeId, types), { className: 'size-3 shrink-0' })}
      <span className="truncate">{children ?? label}</span>
    </span>
  )
}

export function NextStepView({ step, compact = false, empty }: { step?: NextStep; compact?: boolean; empty?: ReactNode }) {
  const types = useActivityTypes()
  if (!step) return <>{empty ?? <NoNextStepTag />}</>
  const overdue = isPast(step.due)
  const today = !overdue && isToday(step.due)
  const label = types.find((type) => type.id === step.type)?.label ?? 'Follow up'
  return (
    <span className={clsx('flex min-w-0', compact ? 'flex-row-reverse items-center justify-end gap-2' : 'flex-col gap-1')}>
      <span className={clsx('flex min-w-0 items-center gap-1.5 text-fg-secondary', compact ? 'text-xs' : 'text-sm')}>
        <TypePill typeId={step.type} className="shrink-0">
          {label}
        </TypePill>
        {step.note && <span className="truncate">{step.note}</span>}
      </span>
      <span
        className={clsx(
          'inline-flex w-fit shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
          overdue ? 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300' : today ? 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-surface-muted text-fg-tertiary',
        )}
      >
        {overdue ? <AlarmClock className="size-3" /> : <CalendarClock className="size-3" />}
        {formatDue(step.due)}
      </span>
    </span>
  )
}

/** The latest update or note in one line: where the record stands. */
export function LastUpdateLine({ event, className }: { event?: LeadEvent; className?: string }) {
  const types = useActivityTypes()
  if (!event) return <span className={clsx('text-xs text-fg-subtle', className)}>No updates yet</span>
  const label = event.kind === 'note' ? 'Note' : (types.find((type) => type.id === event.activityType)?.label ?? 'Update')
  return (
    <span className={clsx('block truncate text-xs text-fg-muted', className)} title={event.text}>
      <span className="font-medium text-fg-tertiary">{label}</span> · {timeAgo(event.at)} · {event.text}
    </span>
  )
}

/** Next step card at the top of a lead or deal: what's planned, or a nudge to plan it. */
export function NextStepCard({ step, onPlan, onUpdate, hint }: { step?: NextStep; onPlan?: () => void; onUpdate?: () => void; hint?: string }) {
  const overdue = !!step && isPast(step.due)
  return (
    <div className={clsx('rounded-xl border bg-surface p-5 shadow-sm', overdue ? 'border-red-300 dark:border-red-500/40' : !step ? 'border-amber-300 dark:border-amber-500/40' : 'border-line')}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-fg-muted">Next step</p>
          <div className="mt-2">
            <NextStepView step={step} empty={<p className="text-sm font-medium text-amber-700 dark:text-amber-300">No next step yet</p>} />
          </div>
          {!step && hint && <p className="mt-1 text-sm text-fg-muted">{hint}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          {onPlan && (
            <Button variant="secondary" onClick={onPlan}>
              {step ? 'Change' : 'Plan next step'}
            </Button>
          )}
          {onUpdate && step && <Button onClick={onUpdate}>Done? Add update</Button>}
        </div>
      </div>
    </div>
  )
}
