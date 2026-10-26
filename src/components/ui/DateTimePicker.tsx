import clsx from 'clsx'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/Button'
import { inputClass, selectClass } from '@/components/ui/Field'

// Values use the same text format as <input type="datetime-local">: "2027-06-17T14:00".
const pad = (value: number) => String(value).padStart(2, '0')
const toValue = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
// Date-only values are "2027-06-17"; read them as local midnight, not UTC.
const parseValue = (value: string) => (value ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00` : value) : null)
const toDateValue = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SHORT_MONTHS = MONTHS.map((name) => name.slice(0, 3))
// The week starts on Saturday; Friday and Saturday are the weekend in Egypt and Saudi Arabia.
const WEEKDAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']
const isWeekend = (date: Date) => date.getDay() === 5 || date.getDay() === 6
const DEFAULT_MINUTES = 10 * 60

/** 12-hour label for minutes after midnight: 570 → "9:30 AM". */
const timeLabel = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  return `${hours % 12 || 12}:${pad(minutes % 60)} ${hours < 12 ? 'AM' : 'PM'}`
}
const SLOTS = Array.from({ length: 96 }, (_, index) => index * 15)

/** Reads a typed time like "2:30 pm", "14:30" or "9". */
function parseTime(text: string): number | null {
  const match = text.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a|p)?$/i)
  if (!match) return null
  let hours = Number(match[1])
  const minutes = Number(match[2] ?? 0)
  const meridiem = match[3]?.toLowerCase()
  if (minutes > 59 || hours > 23) return null
  if (meridiem?.startsWith('p') && hours < 12) hours += 12
  if (meridiem?.startsWith('a') && hours === 12) hours = 0
  return hours * 60 + minutes
}

function formatDateTime(value: string, dateOnly = false) {
  const date = parseValue(value)
  if (!date) return ''
  if (dateOnly) return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  return `${date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${timeLabel(date.getHours() * 60 + date.getMinutes())}`
}

/**
 * Date and time field in our own style. The value only changes when the person presses Done; Cancel,
 * Escape and clicking away discard. `futureOnly` disables days before today (for next steps).
 */
export function DateTimePicker({
  value,
  onChange,
  futureOnly = false,
  placeholder = 'Choose date and time',
  label,
  invalid,
  dateOnly = false,
}: {
  value: string
  onChange: (value: string) => void
  futureOnly?: boolean
  placeholder?: string
  label?: string
  invalid?: boolean
  /** Just a day, no time: the value is "2027-06-17". */
  dateOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label ? `${label}: ${value ? formatDateTime(value, dateOnly) : 'not set'}` : undefined}
        aria-invalid={invalid}
        className={clsx(inputClass, 'flex items-center gap-2 pr-9 text-left', !value && 'text-fg-subtle')}
      >
        <CalendarDays className="size-4 shrink-0 text-fg-muted" />
        <span className="truncate">{value ? formatDateTime(value, dateOnly) : placeholder}</span>
      </button>
      {value && (
        <button type="button" onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-muted hover:bg-surface-muted hover:text-fg" aria-label="Clear date">
          <X className="size-3.5" />
        </button>
      )}
      {open && (
        <PickerPanel
          value={value}
          futureOnly={futureOnly}
          dateOnly={dateOnly}
          anchorRef={triggerRef}
          onCancel={() => {
            setOpen(false)
            triggerRef.current?.focus()
          }}
          onDone={(next) => {
            onChange(next)
            setOpen(false)
            triggerRef.current?.focus()
          }}
        />
      )}
    </div>
  )
}

function PickerPanel({
  value,
  futureOnly,
  dateOnly,
  anchorRef,
  onCancel,
  onDone,
}: {
  value: string
  futureOnly: boolean
  dateOnly: boolean
  anchorRef: RefObject<HTMLButtonElement | null>
  onCancel: () => void
  onDone: (value: string) => void
}) {
  const initial = parseValue(value)
  const [today] = useState(() => startOfDay(new Date()))
  const [day, setDay] = useState<Date | null>(initial ? startOfDay(initial) : null)
  const [minutes, setMinutes] = useState<number | null>(initial ? initial.getHours() * 60 + initial.getMinutes() : null)
  const [month, setMonth] = useState(() => new Date((initial ?? today).getFullYear(), (initial ?? today).getMonth(), 1))
  const [cursor, setCursor] = useState<Date>(initial ? startOfDay(initial) : today)
  const [typed, setTyped] = useState('')
  const [phone] = useState(() => window.matchMedia('(max-width: 639px)').matches)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const slotListRef = useRef<HTMLDivElement>(null)

  // Desktop: float next to the field (below, or above when there's no room), kept on screen.
  useLayoutEffect(() => {
    const anchor = anchorRef.current
    if (phone || !anchor || !panelRef.current) return
    const field = anchor.getBoundingClientRect()
    const panel = panelRef.current.getBoundingClientRect()
    const below = field.bottom + 6
    const top = below + panel.height > window.innerHeight - 8 ? Math.max(8, field.top - panel.height - 6) : below
    setPosition({ top, left: Math.min(Math.max(8, field.left), window.innerWidth - panel.width - 8) })
  }, [phone, anchorRef])

  // Show the chosen (or nearest working-hours) time slot.
  useEffect(() => {
    const target = slotListRef.current?.querySelector<HTMLElement>(`[data-minutes="${minutes === null ? DEFAULT_MINUTES : Math.round(minutes / 15) * 15}"]`)
    target?.scrollIntoView({ block: 'center' })
  }, [minutes])

  const onCancelRef = useRef(onCancel)
  useEffect(() => {
    onCancelRef.current = onCancel
  })
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCancelRef.current()
      }
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node) && !anchorRef.current?.contains(event.target as Node)) onCancelRef.current()
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [anchorRef])

  const disabled = (date: Date) => futureOnly && date < today
  const pickDay = (date: Date) => {
    if (disabled(date)) return
    setDay(date)
    setCursor(date)
    if (date.getMonth() !== month.getMonth()) setMonth(new Date(date.getFullYear(), date.getMonth(), 1))
    if (minutes === null) setMinutes(DEFAULT_MINUTES)
  }
  const quick = (date: Date) => {
    pickDay(date)
    setMinutes((current) => current ?? DEFAULT_MINUTES)
  }
  const nextSunday = addDays(today, ((7 - today.getDay()) % 7) || 7)

  // Six weeks starting on the Saturday on or before the 1st.
  const gridStart = addDays(month, -((month.getDay() + 1) % 7))
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))

  const onGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key]
    if (step) {
      event.preventDefault()
      const next = addDays(cursor, step)
      setCursor(next)
      if (next.getMonth() !== month.getMonth()) setMonth(new Date(next.getFullYear(), next.getMonth(), 1))
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      pickDay(cursor)
    }
  }
  // Keep keyboard focus on the cursor day as it moves.
  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>(`[data-day="${dayKey(cursor)}"]`)?.focus({ preventScroll: true })
  }, [cursor])

  const ready = !!day && (dateOnly || minutes !== null)
  const done = () => {
    if (day && dateOnly) return onDone(toDateValue(day))
    if (!day || minutes === null) return
    onDone(toValue(new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60)))
  }
  const applyTyped = () => {
    const parsed = parseTime(typed)
    if (parsed !== null) {
      setMinutes(parsed)
      setTyped('')
    }
  }
  const years = Array.from({ length: 6 }, (_, index) => today.getFullYear() - 1 + index)

  const content = (
    <>
      {phone && <div className="fixed inset-0 z-[60] bg-black/40 motion-safe:animate-fade-in" aria-hidden />}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Choose date and time"
        style={phone ? undefined : { top: position?.top ?? -9999, left: position?.left ?? -9999 }}
        className={clsx(
          'z-[61] flex flex-col border border-line bg-surface shadow-xl',
          phone ? 'fixed inset-x-0 bottom-0 max-h-[90vh] rounded-t-2xl pb-[env(safe-area-inset-bottom)] motion-safe:animate-fade-up' : clsx('fixed rounded-xl motion-safe:animate-pop-in', dateOnly ? 'w-[18rem]' : 'w-[28rem]'),
        )}
      >
        <div className="flex flex-wrap gap-1.5 border-b border-line-subtle px-3 py-2.5">
          {(
            [
              ['Today', today],
              ['Tomorrow', addDays(today, 1)],
              ['Next Sunday', nextSunday],
              ['In 1 week', addDays(today, 7)],
            ] as const
          ).map(([text, date]) => (
            <button
              key={text}
              type="button"
              onClick={() => quick(date)}
              className={clsx(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                day && dayKey(day) === dayKey(date) ? 'border-brand-500 bg-accent-soft font-medium text-fg' : 'border-line text-fg-tertiary hover:bg-surface-muted',
              )}
            >
              {text}
            </button>
          ))}
        </div>

        <div className={clsx('min-h-0 overflow-y-auto', phone ? 'flex flex-col' : 'flex')}>
          <div className="p-3 sm:w-72">
            <div className="mb-2 flex items-center gap-1">
              <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-md p-1.5 text-fg-tertiary hover:bg-surface-muted" aria-label="Previous month">
                <ChevronLeft className="size-4" />
              </button>
              <div className="flex flex-1 justify-center gap-1.5">
                <div className="w-[5.5rem]">
                  <select className={clsx(selectClass, 'py-1 pl-2.5 text-sm font-medium')} value={month.getMonth()} onChange={(event) => setMonth(new Date(month.getFullYear(), Number(event.target.value), 1))} aria-label="Month">
                    {SHORT_MONTHS.map((name, index) => (
                      <option key={name} value={index}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-[5.5rem]">
                  <select className={clsx(selectClass, 'py-1 pl-2.5 text-sm font-medium')} value={month.getFullYear()} onChange={(event) => setMonth(new Date(Number(event.target.value), month.getMonth(), 1))} aria-label="Year">
                    {years.map((year) => (
                      <option key={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-md p-1.5 text-fg-tertiary hover:bg-surface-muted" aria-label="Next month">
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 text-center text-[11px] font-medium text-fg-muted">
              {WEEKDAYS.map((name, index) => (
                <span key={name} className={clsx('py-1', index === 0 || index === 6 ? 'text-fg-subtle' : undefined)}>
                  {name}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5" role="grid" aria-label={`${MONTHS[month.getMonth()]} ${month.getFullYear()}`} onKeyDown={onGridKey}>
              {days.map((date) => {
                const selected = day && dayKey(day) === dayKey(date)
                const isToday = dayKey(date) === dayKey(today)
                const outside = date.getMonth() !== month.getMonth()
                const off = disabled(date)
                return (
                  <button
                    key={dayKey(date)}
                    type="button"
                    role="gridcell"
                    data-day={dayKey(date)}
                    tabIndex={dayKey(date) === dayKey(cursor) ? 0 : -1}
                    aria-selected={!!selected}
                    aria-label={date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    disabled={off}
                    onClick={() => pickDay(date)}
                    className={clsx(
                      'flex h-8 items-center justify-center rounded-md text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                      selected ? 'bg-brand-500 font-semibold text-white' : off ? 'cursor-not-allowed text-fg-subtle/50 line-through' : 'hover:bg-surface-muted',
                      !selected && !off && (outside ? 'text-fg-subtle' : isWeekend(date) ? 'text-fg-muted' : 'text-fg'),
                      isToday && !selected && 'ring-1 ring-brand-500',
                    )}
                  >
                    {date.getDate()}
                  </button>
                )
              })}
            </div>
          </div>

          {!dateOnly && (
          <div className={clsx('flex flex-col border-line-subtle', phone ? 'border-t px-3 pb-3 pt-2' : 'w-40 border-l p-2')}>
            <input
              className={clsx(inputClass, 'mb-2 py-1.5 text-sm')}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  applyTyped()
                }
              }}
              onBlur={applyTyped}
              placeholder="Type, e.g. 2:30 pm"
              aria-label="Type a time"
            />
            <div ref={slotListRef} className={clsx('overflow-y-auto', phone ? 'flex h-11 gap-1.5 overflow-x-auto overflow-y-hidden' : 'h-64 space-y-0.5')} role="listbox" aria-label="Time">
              {SLOTS.map((slot) => {
                const selected = minutes === slot
                const working = slot >= 9 * 60 && slot <= 17 * 60
                return (
                  <button
                    key={slot}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-minutes={slot}
                    onClick={() => setMinutes(slot)}
                    className={clsx(
                      'shrink-0 rounded-md px-2.5 py-1.5 text-left text-sm tabular-nums transition-colors',
                      phone ? 'whitespace-nowrap' : 'block w-full',
                      selected ? 'bg-brand-500 font-semibold text-white' : working ? 'text-fg hover:bg-surface-muted' : 'text-fg-subtle hover:bg-surface-muted',
                    )}
                  >
                    {timeLabel(slot)}
                  </button>
                )
              })}
            </div>
            {minutes !== null && minutes % 15 !== 0 && <p className="mt-1.5 text-xs text-fg-muted">Time: {timeLabel(minutes)}</p>}
          </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line-subtle px-3 py-2.5">
          <span className="min-w-0 truncate text-xs text-fg-muted">{dateOnly ? (day ? formatDateTime(toDateValue(day), true) : 'Pick a day') : ready ? formatDateTime(toValue(new Date(day!.getFullYear(), day!.getMonth(), day!.getDate(), Math.floor(minutes! / 60), minutes! % 60))) : 'Pick a day and a time'}</span>
          <div className="flex shrink-0 gap-2">
            <Button variant="secondary" className="py-1.5" onClick={onCancel}>
              Cancel
            </Button>
            <Button className="py-1.5" onClick={done} disabled={!ready}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </>
  )
  // Rendered at the page level so form sheets (which scroll and clip) can't cut it off.
  return createPortal(content, document.body)
}
