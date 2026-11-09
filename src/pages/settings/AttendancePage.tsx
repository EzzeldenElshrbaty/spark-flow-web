import clsx from 'clsx'
import { ArrowLeft, Clock, ExternalLink, Inbox } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useAttendanceDay, useAttendanceDays, useAttendanceReport, useAttendanceScope, useSetTimerSetting, useSetWorkHours, useTimerSetting, useVisits, useWorkHours } from '@/api/attendance'
import type { AttendanceDay, AttendanceDayRow, AttendanceReportRow, CheckLocation, EndReason, Visit, WorkHours } from '@/api/types'
import { useUsers } from '@/api/users'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable, TableSkeleton, type Column } from '@/components/ui/DataTable'
import { Field, inputClass, selectClass } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { QueryError } from '@/components/ui/QueryError'
import { Sheet, SheetCancelButton } from '@/components/ui/Sheet'
import { useCurrentWorkspace } from '@/layout/useCurrentWorkspace'
import { localDay } from '@/lib/dates'
import { formatDate, formatHours, formatTime, formatWhen } from '@/lib/format'
import { timeoutProblem } from '@/lib/hours'
import { useFormCheck } from '@/lib/useFormCheck'
import { paths } from '@/lib/paths'
import { usePermission } from '@/lib/usePermission'
import { describeWorkHours, formatDayMinutes, WEEKDAYS } from '@/lib/workHours'
import { formatAppTime, isFix, mapsUrl, periodOf, PERIODS, placeText, tabOf, TABS, type AttendanceTab } from './attendanceView'

/**
 * Settings → Attendance (Admin and help, slice 5, as the CRM's "User attendance and activities"): each person's days,
 * made from their timers, with where the first one started from (timer slice 3); one day at a glance; app use; and a
 * report per person. Everyone sees their own; who else follows "See everyone’s timers and app use" or the projects
 * they manage (the server decides).
 */
export function AttendancePage() {
  const { ws = '' } = useParams()
  const check = usePermission()
  const [params, setParams] = useSearchParams()
  const scope = useAttendanceScope()
  const { workspace } = useCurrentWorkspace()
  const people = useUsers(workspace?.id).data ?? []
  const [editing, setEditing] = useState(false)
  const tab = tabOf(params.get('tab'))
  const ids = scope.data?.userIds ?? []
  const person = params.get('person') && ids.includes(params.get('person')!) ? params.get('person')! : undefined
  const set = (values: Record<string, string>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(values)) {
          if (value) next.set(key, value)
          else next.delete(key)
        }
        return next
      },
      // A choice is a step Back undoes (UX Phase 2, 2.7).
      { replace: false },
    )
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? '—'

  return (
    <>
      {check('settings.open') && (
        <Link to={paths.settings(ws)} className="mb-3 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft className="size-4 rtl:-scale-x-100" /> Settings
        </Link>
      )}
      <PageHeader title="Attendance" subtitle="Each day’s timers, where they started from, and time using Flow." />
      <HoursBox canChange={check('settings.manage')} onChange={() => setEditing(true)} />
      <nav aria-label="Attendance views" className="mb-3 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => {
          const next = new URLSearchParams(params)
          if (t.id === 'days') next.delete('tab')
          else next.set('tab', t.id)
          return (
            <Link
              key={t.id}
              to={{ search: next.toString() ? `?${next}` : '' }}
              aria-current={tab === t.id ? 'page' : undefined}
              className={clsx(
                'relative shrink-0 px-3 py-2 text-sm font-medium transition-colors',
                "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand-500 after:transition-transform after:duration-200 after:content-['']",
                tab === t.id ? 'text-fg after:scale-x-100' : 'text-fg-muted after:scale-x-0 hover:text-fg',
              )}
            >
              {t.label}
            </Link>
          )
        })}
      </nav>
      {scope.isError ? (
        <QueryError what="attendance" onRetry={() => void scope.refetch()} />
      ) : !scope.data ? (
        <div aria-busy="true">
          <TableSkeleton rows={6} />
        </div>
      ) : (
        <>
          <Filters tab={tab} params={params} set={set} ids={ids} person={person} nameOf={nameOf} />
          <View tab={tab} params={params} person={person} nameOf={nameOf} />
        </>
      )}
      {editing && <WorkHoursSheet onClose={() => setEditing(false)} />}
    </>
  )
}

function HoursBox({ canChange, onChange }: { canChange: boolean; onChange: () => void }) {
  const hours = useWorkHours().data
  const timer = useTimerSetting().data
  if (!hours) return null
  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-sm">
      <Clock aria-hidden className="size-4 shrink-0 text-fg-muted" />
      <div className="min-w-0 flex-1 text-fg-secondary">
        <h2 className="m-0 text-sm font-semibold text-fg">Working hours and timer</h2>
        <p className="m-0">
          Working hours: <span className="font-medium text-fg">{describeWorkHours(hours)}</span>. In after the start counts as late, out before the end as left early.
        </p>
        {timer && <p className="m-0">Timers pause after {timer.timeoutHours} hours and ask if you’re still working.</p>}
      </div>
      {canChange && (
        <Button variant="secondary" onClick={onChange} aria-label="Change working hours and timer">
          Change
        </Button>
      )}
    </div>
  )
}

// ── Filters ──────────────────────────────────────────────────────────────────

type FilterProps = { tab: AttendanceTab; params: URLSearchParams; set: (values: Record<string, string>) => void; ids: string[]; person: string | undefined; nameOf: (id: string) => string }

function Filters({ tab, params, set, ids, person, nameOf }: FilterProps) {
  const only = ids.length <= 1
  return (
    <div className="mb-3 flex flex-wrap items-end gap-2">
      {only ? (
        <p className="m-0 min-w-0 flex-1 basis-full text-sm text-fg-muted sm:basis-auto">Only your own attendance shows here.</p>
      ) : (
        <select className={clsx(selectClass, 'min-w-0 flex-1 sm:max-w-64')} aria-label="Person" value={person ?? ''} onChange={(e) => set({ person: e.target.value })}>
          <option value="">Everyone</option>
          {ids.map((id) => (
            <option key={id} value={id}>
              {nameOf(id)}
            </option>
          ))}
        </select>
      )}
      {tab === 'day' ? (
        <label className="min-w-0 flex-1 sm:max-w-48">
          <span className="sr-only">Day</span>
          <input type="date" className={inputClass} value={dayOf(params)} max={localDay(new Date())} onChange={(e) => set({ day: e.target.value })} />
        </label>
      ) : (
        <select className={clsx(selectClass, 'min-w-0 flex-1 sm:max-w-48')} aria-label="Period" value={String(periodOf(params.get('days')))} onChange={(e) => set({ days: e.target.value === '7' ? '' : e.target.value })}>
          {PERIODS.map((p) => (
            <option key={p.days} value={p.days}>
              {p.label}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

const dayOf = (params: URLSearchParams) => (/^\d{4}-\d{2}-\d{2}$/.test(params.get('day') ?? '') ? params.get('day')! : localDay(new Date()))

// ── The views ────────────────────────────────────────────────────────────────

type ViewProps = { tab: AttendanceTab; params: URLSearchParams; person: string | undefined; nameOf: (id: string) => string }

function View({ tab, params, person, nameOf }: ViewProps) {
  const query = { days: periodOf(params.get('days')), userId: person }
  const days = useAttendanceDays(query, tab === 'days')
  const day = useAttendanceDay(dayOf(params), person, tab === 'day')
  const visits = useVisits(query, tab === 'activity')
  const report = useAttendanceReport(query, tab === 'report')
  if (tab === 'day') return <Loaded what="the day" query={day} empty="Nobody to show for this day." render={(rows) => <DayView rows={rows} nameOf={nameOf} />} />
  if (tab === 'activity') return <Loaded what="app use" query={visits} empty="No time in Flow in this period." render={(rows) => <ActivityView rows={rows} nameOf={nameOf} />} />
  if (tab === 'report') return <Loaded what="the report" query={report} empty="Nobody to show for this period." render={(rows) => <ReportView rows={rows} nameOf={nameOf} />} />
  return <Loaded what="days" query={days} empty="No timers in this period." render={(rows) => <DaysView rows={rows} nameOf={nameOf} />} />
}

function Loaded<T>({ what, query, empty, render }: { what: string; query: { data?: T[]; isError: boolean; refetch: () => unknown }; empty: string; render: (rows: T[]) => ReactNode }) {
  if (query.isError) return <QueryError what={what} onRetry={() => void query.refetch()} />
  if (!query.data)
    return (
      <div aria-busy="true">
        <TableSkeleton rows={6} />
      </div>
    )
  if (query.data.length === 0)
    return (
      <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-14 text-center motion-safe:animate-fade-in">
        <span className="rounded-full bg-accent-soft p-3 text-accent">
          <Inbox className="size-6" />
        </span>
        <p className="mt-3 text-sm text-fg-muted">{empty}</p>
      </div>
    )
  return <>{render(query.data)}</>
}

/** A desktop table and, on phones, a list with the same facts. */
function Both<T>({ label, columns, rows, rowKey, card, storageKey }: { label: string; columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; card: (row: T) => { title: string; lines: ReactNode[] }; storageKey: string }) {
  return (
    <>
      <div className="max-md:hidden">
        <DataTable columns={columns} rows={rows} rowKey={rowKey} storageKey={storageKey} label={label} />
      </div>
      <ul aria-label={label} className="m-0 list-none divide-y divide-line-subtle overflow-hidden rounded-xl border border-line bg-surface p-0 md:hidden">
        {rows.map((row) => {
          const { title, lines } = card(row)
          return (
            <li key={rowKey(row)} className="flex flex-col gap-1 px-4 py-3">
              <span className="truncate text-sm font-medium text-fg">{title}</span>
              {lines.map((line, i) => (
                <span key={i} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
                  {line}
                </span>
              ))}
            </li>
          )
        })}
      </ul>
    </>
  )
}

/** An IP or device, in amber when it differs from that person's day before. */
function Seen({ value, fresh }: { value: string | null; fresh: boolean }) {
  if (!value) return <span className="text-fg-muted">—</span>
  if (!fresh) return <span className="block truncate text-fg-secondary">{value}</span>
  return (
    <span title="Different from their day before" className="inline-block max-w-full truncate rounded-md bg-amber-50 px-1.5 py-0.5 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
      {value}
      <span className="font-medium"> · new</span>
    </span>
  )
}

function Place({ location }: { location: CheckLocation | null }) {
  if (!isFix(location)) return <span className="text-fg-muted">{placeText(location)}</span>
  return (
    <a href={mapsUrl(location)} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 text-accent hover:text-accent-strong">
      <span className="min-w-0 truncate tabular-nums">
        {location.lat}, {location.lng}
        <span className="text-fg-muted"> ±{location.accuracy} m</span>
      </span>
      <ExternalLink aria-hidden className="size-3.5 shrink-0" />
      <span className="sr-only"> (opens Google Maps)</span>
    </a>
  )
}

/** Why a day's last timer ended, when it wasn't Stop: Flow (a Done task, an archive, the 12-hour limit), the timeout, Pause. */
const END_BADGE: Partial<Record<EndReason, string>> = { flow: 'By Flow', timeout: 'Timed out', paused: 'Paused' }

/** In: the day's first timer start, Late when after the working hours' start. */
function InText({ at, late, withDay = false }: { at: string; late: boolean; withDay?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5 tabular-nums">
      {withDay ? formatWhen(at) : formatTime(at)}
      {late && <Badge tone="warning">Late</Badge>}
    </span>
  )
}

/** Out: the day's last timer end, Left early before the working hours' end, or "Timer running" while one still runs. */
function OutText({ at, early, endReason }: { at: string | null; early: boolean; endReason?: EndReason | null }) {
  if (!at) return <span className="text-fg-secondary">Timer running</span>
  const badge = endReason ? END_BADGE[endReason] : undefined
  return (
    <span className="flex flex-wrap items-center gap-1.5 tabular-nums">
      {formatTime(at)}
      {early && <Badge tone="warning">Left early</Badge>}
      {badge && <Badge>{badge}</Badge>}
    </span>
  )
}

function DaysView({ rows, nameOf }: { rows: AttendanceDay[]; nameOf: (id: string) => string }) {
  const columns: Column<AttendanceDay>[] = [
    { id: 'person', header: 'Person', width: 180, cell: (d) => <span className="block truncate font-medium text-fg">{nameOf(d.userId)}</span> },
    { id: 'in', header: 'In', width: 200, cell: (d) => <InText at={d.inAt} late={d.late} withDay /> },
    { id: 'out', header: 'Out', width: 180, cell: (d) => <OutText at={d.outAt} early={d.early} endReason={d.endReason} /> },
    { id: 'hours', header: 'Hours', width: 90, align: 'right', cell: (d) => <span className="tabular-nums">{formatHours(d.hours)}</span> },
    { id: 'ip', header: 'IP', width: 140, cell: (d) => <Seen value={d.from?.ip ?? null} fresh={d.newIp} /> },
    { id: 'device', header: 'Device', width: 190, cell: (d) => <Seen value={d.from?.device ?? null} fresh={d.newDevice} /> },
    { id: 'place', header: 'Location', width: 250, cell: (d) => <Place location={d.from?.location ?? null} /> },
  ]
  return (
    <Both
      label="Days"
      columns={columns}
      rows={rows}
      rowKey={(d) => d.id}
      storageKey="spark-flow.table.attendance.days"
      card={(d) => ({
        title: nameOf(d.userId),
        lines: [
          <>
            In <InText at={d.inAt} late={d.late} withDay /> · Out <OutText at={d.outAt} early={d.early} endReason={d.endReason} />
          </>,
          <>
            <span className="tabular-nums">{formatHours(d.hours)}</span> · <Seen value={d.from?.ip ?? null} fresh={d.newIp} /> · <Seen value={d.from?.device ?? null} fresh={d.newDevice} />
          </>,
          <Place location={d.from?.location ?? null} />,
        ],
      })}
    />
  )
}

function DayView({ rows, nameOf }: { rows: AttendanceDayRow[]; nameOf: (id: string) => string }) {
  const inText = (r: AttendanceDayRow) => (r.inAt ? <InText at={r.inAt} late={r.late} /> : '—')
  const outText = (r: AttendanceDayRow) => (r.inAt ? <OutText at={r.outAt} early={r.early} /> : '—')
  const hours = (r: AttendanceDayRow) => (r.inAt ? formatHours(r.hours) : '—')
  const columns: Column<AttendanceDayRow>[] = [
    { id: 'person', header: 'Person', width: 200, cell: (r) => <span className="block truncate font-medium text-fg">{nameOf(r.userId)}</span> },
    { id: 'in', header: 'In', width: 150, cell: inText },
    { id: 'out', header: 'Out', width: 180, cell: outText },
    { id: 'hours', header: 'Hours', width: 120, align: 'right', cell: (r) => <span className="tabular-nums">{hours(r)}</span> },
    { id: 'app', header: 'App time', width: 120, align: 'right', cell: (r) => <span className="tabular-nums">{formatAppTime(r.appMinutes)}</span> },
  ]
  return (
    <Both
      label="Day view"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.userId}
      storageKey="spark-flow.table.attendance.day"
      card={(r) => ({
        title: nameOf(r.userId),
        lines: [
          <>
            In {inText(r)} · Out {outText(r)}
          </>,
          <>
            Hours {hours(r)} · App time {formatAppTime(r.appMinutes)}
          </>,
        ],
      })}
    />
  )
}

function ActivityView({ rows, nameOf }: { rows: Visit[]; nameOf: (id: string) => string }) {
  const span = (v: Visit) => `${formatTime(v.startedAt)}–${formatTime(v.endedAt)}`
  const columns: Column<Visit>[] = [
    { id: 'person', header: 'Person', width: 180, cell: (v) => <span className="block truncate font-medium text-fg">{nameOf(v.userId)}</span> },
    { id: 'day', header: 'Day', width: 130, cell: (v) => <span className="tabular-nums">{formatDate(`${v.day}T12:00:00`)}</span> },
    { id: 'span', header: 'From–to', width: 170, cell: (v) => <span className="tabular-nums">{span(v)}</span> },
    { id: 'app', header: 'App time', width: 110, align: 'right', cell: (v) => <span className="tabular-nums">{formatAppTime(v.minutes)}</span> },
    { id: 'ip', header: 'IP', width: 140, cell: (v) => <Seen value={v.ip} fresh={false} /> },
    { id: 'device', header: 'Device', width: 190, cell: (v) => <Seen value={v.device} fresh={false} /> },
  ]
  return (
    <Both
      label="Activity log"
      columns={columns}
      rows={rows}
      rowKey={(v) => v.id}
      storageKey="spark-flow.table.attendance.activity"
      card={(v) => ({
        title: nameOf(v.userId),
        lines: [
          <span className="tabular-nums">
            {formatDate(`${v.day}T12:00:00`)} · {span(v)} · {formatAppTime(v.minutes)}
          </span>,
          <>
            {v.ip ?? '—'} · {v.device ?? '—'}
          </>,
        ],
      })}
    />
  )
}

function ReportView({ rows, nameOf }: { rows: AttendanceReportRow[]; nameOf: (id: string) => string }) {
  const clock = (minutes: number | null) => (minutes === null ? '—' : formatDayMinutes(minutes))
  const num = (n: number) => <span className="tabular-nums">{n}</span>
  const columns: Column<AttendanceReportRow>[] = [
    { id: 'person', header: 'Person', width: 190, cell: (r) => <span className="block truncate font-medium text-fg">{nameOf(r.userId)}</span> },
    { id: 'days', header: 'Days in', width: 90, align: 'right', cell: (r) => num(r.daysIn) },
    { id: 'avgIn', header: 'Average in', width: 120, align: 'right', cell: (r) => <span className="tabular-nums">{clock(r.avgIn)}</span> },
    { id: 'avgOut', header: 'Average out', width: 120, align: 'right', cell: (r) => <span className="tabular-nums">{clock(r.avgOut)}</span> },
    { id: 'late', header: 'Late', width: 80, align: 'right', cell: (r) => num(r.late) },
    { id: 'early', header: 'Left early', width: 100, align: 'right', cell: (r) => num(r.early) },
    { id: 'hours', header: 'Hours', width: 110, align: 'right', cell: (r) => <span className="tabular-nums">{formatHours(r.hours)}</span> },
    { id: 'app', header: 'App time', width: 110, align: 'right', cell: (r) => <span className="tabular-nums">{formatAppTime(r.appMinutes)}</span> },
  ]
  return (
    <Both
      label="Report"
      columns={columns}
      rows={rows}
      rowKey={(r) => r.userId}
      storageKey="spark-flow.table.attendance.report"
      card={(r) => ({
        title: nameOf(r.userId),
        lines: [
          <span className="tabular-nums">
            {r.daysIn} days in · in {clock(r.avgIn)} · out {clock(r.avgOut)} on average
          </span>,
          <span className="tabular-nums">
            {r.late} late · {r.early} left early · {formatHours(r.hours)} on timers · {formatAppTime(r.appMinutes)} in Flow
          </span>,
        ],
      })}
    />
  )
}

// ── Working hours ────────────────────────────────────────────────────────────

function WorkHoursSheet({ onClose }: { onClose: () => void }) {
  const current = useWorkHours().data
  const timer = useTimerSetting().data
  if (!current || !timer) return null
  return <WorkHoursForm current={current} timeoutHours={timer.timeoutHours} onClose={onClose} />
}

/** Working hours and the timer timeout (timer slice 2), in one sheet; only what changed is saved. */
function WorkHoursForm({ current, timeoutHours, onClose }: { current: WorkHours; timeoutHours: number; onClose: () => void }) {
  const save = useSetWorkHours()
  const saveTimer = useSetTimerSetting()
  const [days, setDays] = useState(current.days)
  const [start, setStart] = useState(current.start)
  const [end, setEnd] = useState(current.end)
  const [timeout, setTimeoutHours] = useState(String(timeoutHours))
  const hours = timeout.trim() === '' ? NaN : Number(timeout)
  // The timeout's error shows under it from the first Save, and leaves once it's fixed (UX Phase 4, 4.4).
  const { errors, attempt } = useFormCheck({ timeout: timeoutProblem(hours) ?? undefined })
  const pending = save.isPending || saveTimer.isPending
  // Closing with changes asks first (UX Phase 1, 1.2).
  const dirty = [...days].sort((a, b) => a - b).join() !== [...current.days].sort((a, b) => a - b).join() || start !== current.start || end !== current.end || timeout !== String(timeoutHours)
  const submit = async () => {
    if (!attempt()) return
    const sorted = [...days].sort((a, b) => a - b)
    try {
      if (sorted.join() !== current.days.join() || start !== current.start || end !== current.end) await save.mutateAsync({ days: sorted, start, end })
      if (hours !== timeoutHours) await saveTimer.mutateAsync(hours)
      onClose()
    } catch {
      // The refusal is said in the sheet, below.
    }
  }
  const error = save.error?.message ?? saveTimer.error?.message
  const close = () => {
    if (!pending) onClose()
  }
  return (
    <Sheet
      open
      onClose={close}
      dirty={dirty}
      title="Working hours and timer"
      description={`What late and left early mean on Attendance, in ${current.timeZone.split('/').at(-1)!.replace(/_/g, ' ')} time.`}
      footer={
        <>
          <SheetCancelButton disabled={pending} />
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-fg-secondary">Working days</legend>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((name, d) => {
              const on = days.includes(d)
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                  className={clsx(
                    'min-h-11 min-w-11 rounded-lg border px-2.5 text-sm font-medium transition-colors sm:min-h-9',
                    on ? 'border-brand-500 bg-accent-soft text-accent' : 'border-line bg-surface text-fg-secondary hover:bg-surface-sunken',
                  )}
                >
                  {name.slice(0, 3)}
                  <span className="sr-only">{name.slice(3)}</span>
                </button>
              )
            })}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <input type="time" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Ends">
            <input type="time" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <Field label="Pause timers after (hours)" hint="1 to 12. A timer that runs this long pauses and asks if you’re still working." error={errors.timeout}>
          <input type="number" min={1} max={12} step={1} inputMode="numeric" className={inputClass} value={timeout} aria-invalid={Boolean(errors.timeout)} onChange={(e) => setTimeoutHours(e.target.value)} />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        {/* Enter in a field saves, as the footer's button does. */}
        <button type="submit" hidden />
      </form>
    </Sheet>
  )
}
