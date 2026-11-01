import { IconChevronDown, IconPlayerPause } from '@tabler/icons-react'
import { useId, useState, type ReactNode } from 'react'
import { usePreferences, useUpdatePreferences } from '@/api/preferences'
import { viewerZone } from '@/api/scheduled'
import type { DndSchedule, EmailDigest, NotifyLevel, Preferences } from '@/api/types'
import { Button } from '@/components/sf/Button'
import { Icon } from '@/components/sf/Icon'
import { Menu, MenuItem, MenuSeparator } from '@/components/sf/Menu'
import { Checkbox, Toggle } from '@/components/sf/Toggle'
import { TokenInput } from '@/components/sf/TokenInput'
import { toLocalInput } from '@/lib/format'
import { dndEndLabel, dndState, pausePresets } from '@/lib/notifyRules'
import { useNow } from '@/lib/useNow'
import { NOTIFY_LEVELS } from '@/pages/chat/NotifyLevelMenu'

type Part = 'notify' | 'keywords' | 'delivery' | 'dnd'
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
    <div className="sf flex min-h-0 flex-1 flex-col">
      <section aria-labelledby="prefs-title" className="flex min-h-0 min-w-0 flex-1 flex-col bg-sf-surface">
        <header className="flex h-sf-header flex-none items-center ps-4 pe-4 sm:ps-6">
          <h1 id="prefs-title" className="sf-title min-w-0 flex-1 truncate text-sf-text">
            Preferences
          </h1>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto bg-sf-surface-sunken px-2 py-4 sm:px-6">
          {prefs.isError && !p ? (
            <div className="flex flex-col items-start gap-3 px-2 py-6">
              <p className="sf-ui m-0 text-sf-text-secondary">Your preferences didn’t load.</p>
              <Button size="sm" onClick={() => void prefs.refetch()} disabled={prefs.isFetching}>
                {prefs.isFetching ? 'Trying…' : 'Try again'}
              </Button>
            </div>
          ) : !p ? (
            <div aria-hidden className="mx-auto flex max-w-[720px] flex-col gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-36 animate-pulse rounded-sf-lg bg-sf-surface-hover" />
              ))}
            </div>
          ) : (
            <div className="mx-auto flex max-w-[720px] flex-col gap-4">
              <NotifySection prefs={p} error={errors.notify} onSave={(patch) => save('notify', patch)} />
              <KeywordsSection prefs={p} error={errors.keywords} onError={(text) => setErrors((e) => ({ ...e, keywords: text }))} onSave={(patch) => save('keywords', patch)} />
              <DeliverySection prefs={p} error={errors.delivery} onError={(text) => setErrors((e) => ({ ...e, delivery: text }))} onSave={(patch) => save('delivery', patch)} />
              <DndSection prefs={p} error={errors.dnd} onError={(text) => setErrors((e) => ({ ...e, dnd: text }))} onSave={(patch) => save('dnd', patch)} />
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

/** A card with a heading, a line under it, and the section's error at the end. */
function Section({ title, help, error, children }: { title: string; help?: ReactNode; error?: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="rounded-sf-lg border border-sf-line bg-sf-surface p-4 sm:p-5">
      <h2 id={id} className="sf-body-strong m-0 text-sf-text">
        {title}
      </h2>
      {help && <p className="sf-small m-0 mt-1 text-sf-text-secondary">{help}</p>}
      <div className="mt-3 flex flex-col gap-3">{children}</div>
      {error && (
        <p role="alert" className="sf-small m-0 mt-3 text-sf-error">
          {error}
        </p>
      )}
    </section>
  )
}

/** Radio rows (44px touch on phones); the group is named by `legend`. */
function Radios<T extends string>({ legend, options, value, onPick }: { legend: string; options: { id: T; label: string }[]; value: T; onPick: (value: T) => void }) {
  const name = useId()
  return (
    <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
      <legend className="sr-only">{legend}</legend>
      {options.map((o) => (
        <label key={o.id} className="sf-ui flex min-h-8 cursor-pointer items-center gap-2 text-sf-text max-md:min-h-11">
          <input type="radio" name={name} checked={value === o.id} onChange={() => o.id !== value && onPick(o.id)} className="sf-focus size-4 accent-[var(--accent-fill)]" />
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
        <p id={id} className="sf-ui m-0 text-sf-text">
          {label}
        </p>
        {help && <p className="sf-small m-0 text-sf-text-secondary">{help}</p>}
      </div>
      <span className="flex min-h-6 items-center max-md:min-h-11">
        <Toggle checked={checked} onChange={onChange} labelledBy={id} />
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
      <TokenInput
        label="Keywords"
        tokens={prefs.keywords.map((k) => ({ id: k, label: k }))}
        query={query}
        onQueryChange={setQuery}
        onAdd={() => {}}
        onCommit={commit}
        onRemove={(word) => onSave({ keywords: prefs.keywords.filter((k) => k !== word) })}
        placeholder="Type a word and press Enter"
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
        <p className="sf-ui m-0 text-sf-text">Email digest of missed mentions</p>
        <p className="sf-small m-0 mb-1 text-sf-text-secondary">Mentions you haven’t read, by email. Not sent in this preview.</p>
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
        <p role="status" className="sf-ui m-0 flex flex-wrap items-center gap-2 text-sf-text">
          {state.reason === 'paused' ? `Notifications are paused until ${dndEndLabel(state, now)}.` : `Do Not Disturb is on until ${dndEndLabel(state, now)} (your schedule).`}
          {state.reason === 'paused' && (
            <Button size="sm" touch onClick={() => onSave({ dndUntil: null })}>
              Resume
            </Button>
          )}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Menu
          label="Pause notifications"
          trigger={(props) => (
            <Button size="sm" touch icon={IconPlayerPause} {...props}>
              Pause notifications
              <Icon icon={IconChevronDown} size={16} />
            </Button>
          )}
        >
          {/* Worked out again on the click: the shown list can be half a minute old. */}
          {pausePresets(now).map((preset, i) => (
            <MenuItem key={preset.label} onSelect={() => onSave({ dndUntil: pausePresets(new Date())[i].until })}>
              {preset.label}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onSelect={() => setCustom(toLocalInput(new Date(now.getTime() + 3 * 3_600_000)))}>Custom time…</MenuItem>
        </Menu>
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
            <label className="sf-small text-sf-text-secondary">
              <span className="sr-only">Pause until</span>
              <input type="datetime-local" value={custom} min={toLocalInput(now)} onChange={(e) => setCustom(e.target.value)} className="sf-focus sf-ui h-8 rounded-sf-md border border-sf-line-strong bg-sf-surface px-2 text-sf-text max-md:h-11" />
            </label>
            <Button size="sm" touch type="submit">
              Pause
            </Button>
            <Button size="sm" touch variant="ghost" onClick={() => setCustom(null)}>
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
      <fieldset className="m-0 flex flex-wrap gap-x-4 gap-y-1 border-0 p-0">
        <legend className="sf-small mb-1 text-sf-text-secondary">On these days</legend>
        {DAYS.map((day, i) => (
          <span key={day} className="flex min-h-8 items-center max-md:min-h-11">
            <Checkbox checked={schedule.days.includes(i)} onChange={(on) => setSchedule({ days: on ? [...schedule.days, i].sort((a, b) => a - b) : schedule.days.filter((d) => d !== i) })}>
              {day}
            </Checkbox>
          </span>
        ))}
      </fieldset>
      <p className="sf-small m-0 flex flex-wrap items-center gap-2 text-sf-text-secondary">
        Times are in {schedule.tz}.
        {zone && zone !== schedule.tz && (
          <Button size="sm" touch variant="ghost" onClick={() => setSchedule({ tz: zone })}>
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
    <label className="sf-small flex flex-col gap-1 text-sf-text-secondary">
      {label}
      <input
        type="time"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => (draft && draft !== value ? onSave(draft) : setDraft(value))}
        className="sf-focus sf-ui h-8 rounded-sf-md border border-sf-line-strong bg-sf-surface px-2 text-sf-text tabular-nums max-md:h-11"
      />
    </label>
  )
}
