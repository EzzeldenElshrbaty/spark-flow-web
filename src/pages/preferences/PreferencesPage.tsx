import clsx from 'clsx'
import { ChevronDown, Pause, X } from 'lucide-react'
import { useId, useRef, useState, type ReactNode } from 'react'
import { usePreferences, useUpdatePreferences } from '@/api/preferences'
import { viewerZone } from '@/api/scheduled'
import type { DndSchedule, EmailDigest, NotifyLevel, Preferences } from '@/api/types'
import { Button } from '@/components/ui/Button'
import { inputClass } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { MenuPanel, menuItemClass } from '@/components/ui/Menu'
import { PageHeader } from '@/components/ui/PageHeader'
import { QueryError } from '@/components/ui/QueryError'
import { Switch } from '@/components/ui/Switch'
import { toLocalInput } from '@/lib/format'
import { dndEndLabel, dndState, pausePresets } from '@/lib/notifyRules'
import { useNow } from '@/lib/useNow'
import { NOTIFY_LEVELS } from '@/pages/chat/NotifyLevelMenu'

type Part = 'notify' | 'keywords' | 'delivery' | 'dnd' | 'keyboard'
const DIGESTS: { id: EmailDigest; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'hourly', label: 'Hourly' },
  { id: 'daily', label: 'Daily' },
]
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** What the browser says about notifications from this site, in words for the Delivery section. */
function blockedLine(): string | null {
  if (typeof Notification === 'undefined') return 'This browser can’t show notifications.'
  if (Notification.permission === 'denied') return 'Your browser blocks notifications from Flow. Allow them in its site settings, then turn this on.'
  return null
}

/**
 * My notification preferences (spec 6.11): the default level for channels, keywords, how I hear outside the app
 * (desktop, push, the email digest) and Do Not Disturb. Each change saves on its own; a refusal is said in its section.
 * A settings page in the standard look, like Settings (UX Phase 3, 3.1).
 */
export function PreferencesPage() {
  const prefs = usePreferences()
  const update = useUpdatePreferences()
  const [errors, setErrors] = useState<Partial<Record<Part, string>>>({})
  const save = (part: Part, patch: Partial<Preferences>) =>
    update.mutateAsync(patch).then(
      () => setErrors((e) => ({ ...e, [part]: undefined })),
      (error: Error) => setErrors((e) => ({ ...e, [part]: error.message || 'Couldn’t save that. Try again.' })),
    )
  const p = prefs.data
  return (
    <>
      <PageHeader title="Preferences" subtitle="How Flow tells you about messages. Only you see these." />
      {prefs.isError && !p ? (
        <QueryError what="your preferences" onRetry={() => void prefs.refetch()} />
      ) : !p ? (
        <div aria-hidden className="flex max-w-3xl flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-surface-muted" />
          ))}
        </div>
      ) : (
        <div className="flex max-w-3xl flex-col gap-4">
          <NotifySection prefs={p} error={errors.notify} onSave={(patch) => save('notify', patch)} />
          <KeywordsSection prefs={p} error={errors.keywords} onError={(text) => setErrors((e) => ({ ...e, keywords: text }))} onSave={(patch) => save('keywords', patch)} />
          <DeliverySection prefs={p} error={errors.delivery} onError={(text) => setErrors((e) => ({ ...e, delivery: text }))} onSave={(patch) => save('delivery', patch)} />
          <DndSection prefs={p} error={errors.dnd} onError={(text) => setErrors((e) => ({ ...e, dnd: text }))} onSave={(patch) => save('dnd', patch)} />
          {/* WCAG 2.1.4: one-key shortcuts can be turned off (UX Phase 5A, 5.13). */}
          <Section title="Keyboard" error={errors.keyboard}>
            <SwitchRow
              label="Single-key shortcuts"
              help="Press / to search, G then P for Projects, G then C for Chat. Turn them off if they get in the way of a screen reader or voice control."
              checked={p.singleKeyShortcuts}
              onChange={(singleKeyShortcuts) => save('keyboard', { singleKeyShortcuts })}
            />
          </Section>
        </div>
      )}
    </>
  )
}

/** A kit card with a heading, a line under it, and the section's error at the end. */
function Section({ title, help, error, children }: { title: string; help?: ReactNode; error?: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="rounded-xl border border-line bg-surface shadow-sm">
      <div className="border-b border-line-subtle px-5 py-3.5">
        <h2 id={id} className="text-sm font-semibold text-fg">
          {title}
        </h2>
        {help && <p className="mt-0.5 text-sm text-fg-muted">{help}</p>}
      </div>
      <div className="flex flex-col gap-3 px-5 py-4">
        {children}
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}

/** Radio rows (44px touch on phones); the group is named by `legend`. */
function Radios<T extends string>({ legend, options, value, onPick }: { legend: string; options: { id: T; label: string }[]; value: T; onPick: (value: T) => void }) {
  const name = useId()
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="sr-only">{legend}</legend>
      {options.map((o) => (
        <label key={o.id} className="flex min-h-8 cursor-pointer items-center gap-2.5 text-sm text-fg max-md:min-h-11">
          <input type="radio" name={name} checked={value === o.id} onChange={() => o.id !== value && onPick(o.id)} className="size-4 accent-brand-500" />
          {o.label}
        </label>
      ))}
    </fieldset>
  )
}

/** A switch with its words beside it; the pair is the touch target. */
function SwitchRow({ label, help, checked, onChange }: { label: string; help?: ReactNode; checked: boolean; onChange: (on: boolean) => void }) {
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p id={id} className="text-sm font-medium text-fg">
          {label}
        </p>
        {help && <p className="text-sm text-fg-muted">{help}</p>}
      </div>
      <span className="flex min-h-6 items-center max-md:min-h-11">
        <Switch checked={checked} onChange={onChange} labelledBy={id} />
      </span>
    </div>
  )
}

function NotifySection({ prefs, error, onSave }: { prefs: Preferences; error?: string; onSave: (patch: Partial<Preferences>) => void }) {
  return (
    <Section title="Notify me about" help="Channels follow this until you pick a level in one. Direct messages tell you about every message unless you change one." error={error}>
      <Radios<NotifyLevel> legend="Notify me about" options={NOTIFY_LEVELS.map((l) => ({ id: l.level, label: l.label }))} value={prefs.defaultLevel} onPick={(defaultLevel) => onSave({ defaultLevel })} />
    </Section>
  )
}

const MAX_KEYWORDS = 20
const MAX_KEYWORD = 40

function KeywordsSection({ prefs, error, onError, onSave }: { prefs: Preferences; error?: string; onError: (text: string) => void; onSave: (patch: Partial<Preferences>) => void }) {
  const [query, setQuery] = useState('')
  // The server's limits, said before saving so what I typed stays to fix (false keeps it in the box).
  const commit = (word: string) => {
    if (word.length > MAX_KEYWORD) return onError(`A keyword has at most ${MAX_KEYWORD} characters.`), false
    if (prefs.keywords.some((k) => k.toLowerCase() === word.toLowerCase())) return true
    if (prefs.keywords.length >= MAX_KEYWORDS) return onError(`You can have up to ${MAX_KEYWORDS} keywords.`), false
    onSave({ keywords: [...prefs.keywords, word] })
    return true
  }
  return (
    <Section title="Keywords" help="Someone else’s message with one of these counts like a mention, in channels you’re in. Up to 20." error={error}>
      {prefs.keywords.length > 0 && (
        <ul aria-label="Your keywords" className="flex flex-wrap gap-1.5">
          {prefs.keywords.map((word) => (
            <li key={word} className="inline-flex items-center gap-0.5 rounded-full border border-line bg-surface-muted ps-3 text-sm text-fg">
              {word}
              <IconButton label={`Remove ${word}`} icon={X} size="sm" touch onClick={() => onSave({ keywords: prefs.keywords.filter((k) => k !== word) })} />
            </li>
          ))}
        </ul>
      )}
      <input
        className={inputClass}
        aria-label="Keywords"
        placeholder="Type a word and press Enter"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // Enter or a comma adds the word; Backspace in the empty box takes the last one off (as chat's token box).
          if (e.key === 'Backspace' && query === '' && prefs.keywords.length) return onSave({ keywords: prefs.keywords.slice(0, -1) })
          if (e.key !== 'Enter' && e.key !== ',') return
          e.preventDefault()
          const word = query.trim()
          if (word && commit(word)) setQuery('')
        }}
      />
    </Section>
  )
}

function DeliverySection({ prefs, error, onError, onSave }: { prefs: Preferences; error?: string; onError: (text: string) => void; onSave: (patch: Partial<Preferences>) => void }) {
  // Turning desktop on asks the browser first; it only saves once the browser allows it (spec 6.11 delivery).
  const desktop = async (on: boolean) => {
    if (!on) return onSave({ desktop: false })
    const blocked = blockedLine()
    if (blocked) return onError(blocked)
    const answer = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    if (answer === 'granted') onSave({ desktop: true })
    else if (answer === 'default') onError('Allow notifications when your browser asks, to turn this on.')
    else onError('Your browser blocks notifications from Flow. Allow them in its site settings, then turn this on.')
  }
  const stopped = prefs.desktop && typeof Notification !== 'undefined' && Notification.permission !== 'granted'
  return (
    <Section title="Delivery" error={error}>
      <SwitchRow
        label="Desktop notifications"
        help={stopped ? 'Your browser isn’t showing them now: allow notifications from Flow in its site settings.' : 'While Flow is open in the background: mentions, keywords, direct messages and channels set to All.'}
        checked={prefs.desktop}
        onChange={(on) => void desktop(on)}
      />
      <SwitchRow label="Mobile push" help="Sent by the Flow mobile app. Not sent in this preview." checked={prefs.push} onChange={(push) => onSave({ push })} />
      <div>
        <p className="text-sm font-medium text-fg">Email digest of missed mentions</p>
        <p className="mb-1 text-sm text-fg-muted">Mentions you haven’t read, by email. Not sent in this preview.</p>
        <Radios<EmailDigest> legend="Email digest of missed mentions" options={DIGESTS} value={prefs.emailDigest} onPick={(emailDigest) => onSave({ emailDigest })} />
      </div>
    </Section>
  )
}

function DndSection({ prefs, error, onError, onSave }: { prefs: Preferences; error?: string; onError: (text: string) => void; onSave: (patch: Partial<Preferences>) => void }) {
  const now = useNow(30_000)
  const state = dndState(prefs, now)
  const [custom, setCustom] = useState<string | null>(null)
  const schedule = prefs.dndSchedule
  const setSchedule = (patch: Partial<DndSchedule>) => onSave({ dndSchedule: { ...schedule, ...patch } })
  const zone = viewerZone()
  return (
    <Section title="Do Not Disturb" help="Holds back desktop notifications, mobile push and email. Badges and counts in Flow don’t change." error={error}>
      {state && (
        <p role="status" className="flex flex-wrap items-center gap-2 text-sm text-fg">
          {state.reason === 'paused' ? `Notifications are paused until ${dndEndLabel(state, now)}.` : `Do Not Disturb is on until ${dndEndLabel(state, now)} (your schedule).`}
          {state.reason === 'paused' && (
            <Button variant="secondary" className="max-md:min-h-11" onClick={() => onSave({ dndUntil: null })}>
              Resume
            </Button>
          )}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <PauseMenu now={now} onPick={(until) => onSave({ dndUntil: until })} onCustom={() => setCustom(toLocalInput(new Date(now.getTime() + 3 * 3_600_000)))} />
        {custom !== null && (
          <form
            // Said in the section like any other refusal, not in the browser's own bubble.
            noValidate
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              const until = new Date(custom)
              if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) return onError('Pick a time after now.')
              onSave({ dndUntil: until.toISOString() })
              setCustom(null)
            }}
          >
            <label>
              <span className="sr-only">Pause until</span>
              <input type="datetime-local" value={custom} min={toLocalInput(now)} onChange={(e) => setCustom(e.target.value)} className={clsx(inputClass, 'w-auto')} />
            </label>
            <Button variant="secondary" type="submit" className="max-md:min-h-11">
              Pause
            </Button>
            <Button variant="ghost" onClick={() => setCustom(null)} className="max-md:min-h-11">
              Cancel
            </Button>
          </form>
        )}
      </div>
      <SwitchRow label="Turn on a schedule" help="Every week, on the days you pick." checked={schedule.on} onChange={(on) => setSchedule({ on })} />
      <div className="flex flex-wrap items-end gap-3">
        <TimeField label="From" value={schedule.from} onSave={(from) => setSchedule({ from })} />
        <TimeField label="To" value={schedule.to} onSave={(to) => setSchedule({ to })} />
      </div>
      <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
        <legend className="mb-1 text-sm text-fg-muted">On these days</legend>
        {DAYS.map((day, i) => (
          <label key={day} className="flex min-h-8 cursor-pointer items-center gap-2 text-sm text-fg max-md:min-h-11">
            <input
              type="checkbox"
              className="size-4 accent-brand-500"
              checked={schedule.days.includes(i)}
              onChange={(e) => setSchedule({ days: e.target.checked ? [...schedule.days, i].sort((a, b) => a - b) : schedule.days.filter((d) => d !== i) })}
            />
            {day}
          </label>
        ))}
      </fieldset>
      <p className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
        Times are in {schedule.tz}.
        {zone && zone !== schedule.tz && (
          <Button variant="ghost" onClick={() => setSchedule({ tz: zone })} className="max-md:min-h-11">
            Use {zone}
          </Button>
        )}
      </p>
    </Section>
  )
}

/**
 * A schedule time, saved once I leave the field: a time input reports each keystroke as a whole time ("2" is 02:00),
 * so saving on change would store half-typed times. A change from elsewhere (another tab) shows when it lands.
 */
function TimeField({ label, value, onSave }: { label: string; value: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value)
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    setDraft(value)
  }
  return (
    <label className="flex flex-col gap-1 text-sm text-fg-secondary">
      {label}
      <input
        type="time"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => (draft && draft !== value ? onSave(draft) : setDraft(value))}
        className={clsx(inputClass, 'w-32 tabular-nums')}
      />
    </label>
  )
}

/** Pause notifications: the presets, then Custom time…, in the kit's menu. */
function PauseMenu({ now, onPick, onCustom }: { now: Date; onPick: (until: string) => void; onCustom: () => void }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const pick = (run: () => void) => () => {
    setOpen(false)
    run()
  }
  return (
    <div className="relative">
      <Button ref={triggerRef} variant="secondary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="max-md:min-h-11">
        <Pause aria-hidden className="size-4" />
        Pause notifications
        <ChevronDown aria-hidden className="size-4" />
      </Button>
      <MenuPanel open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} label="Pause notifications" className="p-1.5 sm:w-52">
        {/* Worked out again on the click: the shown list can be half a minute old. */}
        {pausePresets(now).map((preset, i) => (
          <button key={preset.label} type="button" role="menuitem" className={menuItemClass} onClick={pick(() => onPick(pausePresets(new Date())[i].until))}>
            {preset.label}
          </button>
        ))}
        <div role="separator" className="my-1 h-px bg-line-subtle" />
        <button type="button" role="menuitem" className={menuItemClass} onClick={pick(onCustom)}>
          Custom time…
        </button>
      </MenuPanel>
    </div>
  )
}
