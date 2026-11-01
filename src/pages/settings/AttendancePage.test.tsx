// @vitest-environment jsdom
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AttendanceDayRow, AttendanceReportRow, CheckEvent, Me, Visit } from '@/api/types'
import { api, ApiError } from '@/lib/api'
import { ALL_PERMISSIONS } from '@/lib/permissions'
import { AttendancePage } from './AttendancePage'

window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const event = (over: Partial<CheckEvent>): CheckEvent => ({
  id: 'ci-1:in', userId: 'u-5', kind: 'in', at: '2026-10-26T07:40:00.000Z', ip: '41.233.18.9', device: 'Chrome 130 · Windows',
  location: { lat: 30.0626, lng: 31.3409, accuracy: 12 }, byFlow: false, newIp: false, newDevice: false, offHours: false, ...over,
})
const events: CheckEvent[] = [
  event({ id: 'ci-1:out', kind: 'out', at: '2026-10-26T15:05:00.000Z', location: 'blocked' }),
  event({ ip: '197.48.112.6', device: 'Chrome 130 · Android', newIp: true, newDevice: true, offHours: true }),
  event({ id: 'ci-2:out', userId: 'u-3', kind: 'out', at: '2026-10-25T20:00:00.000Z', ip: null, device: null, location: null, byFlow: true }),
]
const dayRows: AttendanceDayRow[] = [
  { userId: 'u-5', checkedInAt: '2026-10-26T07:40:00.000Z', checkedOutAt: '2026-10-26T15:05:00.000Z', byFlow: false, hours: 445 / 60, appMinutes: 360, late: true, early: false },
  { userId: 'u-1', checkedInAt: null, checkedOutAt: null, byFlow: false, hours: 0, appMinutes: 0, late: false, early: false },
]
const visits: Visit[] = [{ id: 'v-1', userId: 'u-5', day: '2026-10-26', startedAt: '2026-10-26T07:40:00.000Z', endedAt: '2026-10-26T09:00:00.000Z', minutes: 75, ip: '41.233.18.9', device: 'Chrome 130 · Windows' }]
const report: AttendanceReportRow[] = [{ userId: 'u-5', daysIn: 5, avgIn: 552, avgOut: 1085, late: 1, early: 0, hours: 40.4, appMinutes: 1940 }]

let me: Me
beforeEach(() => {
  me = { id: 'u-1', name: 'Youssef Abdelrahman', email: '', title: '', roleIds: ['admin'], presence: 'active', teamIds: [], grants: [...ALL_PERMISSIONS] }
  vi.spyOn(api.users, 'me').mockImplementation(async () => me)
  vi.spyOn(api.workspaces, 'list').mockResolvedValue([{ id: 'ws-eng', slug: 'engineering', name: 'Spark Engineering' }])
  vi.spyOn(api.users, 'list').mockResolvedValue([
    { id: 'u-1', name: 'Youssef Abdelrahman', email: '', title: '', roleIds: ['admin'], teamIds: [], presence: 'active' },
    { id: 'u-3', name: 'Ahmed Hassan', email: '', title: '', roleIds: ['member'], teamIds: [], presence: 'active' },
    { id: 'u-5', name: 'Salma Ibrahim', email: '', title: '', roleIds: ['member'], teamIds: [], presence: 'active' },
  ])
  vi.spyOn(api.attendance, 'scope').mockResolvedValue({ userIds: ['u-1', 'u-3', 'u-5'] })
  vi.spyOn(api.attendance, 'checkIns').mockResolvedValue(events)
  vi.spyOn(api.attendance, 'day').mockResolvedValue(dayRows)
  vi.spyOn(api.attendance, 'visits').mockResolvedValue(visits)
  vi.spyOn(api.attendance, 'report').mockResolvedValue(report)
  vi.spyOn(api.attendance, 'workHours').mockResolvedValue({ days: [0, 1, 2, 3, 4], start: '09:00', end: '17:00', timeZone: 'Africa/Cairo' })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Address() {
  const { search } = useLocation()
  return <output data-testid="address">{search}</output>
}

async function mount(search = '') {
  const client: QueryClient = new QueryClient({ mutationCache: new MutationCache({ onSuccess: () => client.invalidateQueries() }) })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/w/engineering/settings/attendance${search}`]}>
        <Routes>
          <Route path="/w/:ws/settings/attendance" element={<><AttendancePage /><Address /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await screen.findByRole('heading', { name: 'Attendance', level: 1 })
}
const table = (name: string) => screen.findByRole('table', { name })
const rows = async (name: string) => within(await table(name)).getAllByRole('row').slice(1)
const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map((c) => c.textContent)

describe('Settings → Attendance (Admin and help, slice 5)', () => {
  it('check-ins: who, in or out, when, and where from; a new IP or device is marked; the place opens in Maps', async () => {
    await mount()
    const [out, late, flow] = await rows('Check-ins')
    expect(cells(late!).slice(0, 5)).toEqual(['Salma Ibrahim', 'Checked inLate', expect.stringMatching(/^Mon 26 Oct, \d+:40 [AP]M$/), '197.48.112.6 · new', 'Chrome 130 · Android · new'])
    const map = within(late!).getByRole('link', { name: /30\.0626, 31\.3409/ })
    expect(map.getAttribute('href')).toBe('https://www.google.com/maps/search/?api=1&query=30.0626%2C31.3409')
    expect(map.getAttribute('target')).toBe('_blank')
    expect(map.getAttribute('rel')).toBe('noopener noreferrer')
    expect(cells(out!)[5]).toBe('Location blocked')
    expect(cells(flow!).slice(1, 6)).toEqual(['Checked outBy Flow', expect.any(String), '—', '—', '—'])
    expect(api.attendance.checkIns).toHaveBeenCalledWith({ days: 7, userId: undefined })
  })

  it('the person and period filters ask again and stay in the address', async () => {
    await mount()
    await table('Check-ins')
    fireEvent.change(screen.getByRole('combobox', { name: 'Person' }), { target: { value: 'u-5' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Period' }), { target: { value: '30' } })
    await waitFor(() => expect(api.attendance.checkIns).toHaveBeenLastCalledWith({ days: 30, userId: 'u-5' }))
    expect(screen.getByTestId('address').textContent).toBe('?person=u-5&days=30')
    expect(within(screen.getByRole('combobox', { name: 'Person' })).getAllByRole('option').map((o) => o.textContent)).toEqual(['Everyone', 'Youssef Abdelrahman', 'Ahmed Hassan', 'Salma Ibrahim'])
  })

  it('day view: a row per person with in, out, hours checked in and app time, for the day picked', async () => {
    await mount('?tab=day&day=2026-10-26')
    expect(screen.getByRole('link', { name: 'Day view' }).getAttribute('aria-current')).toBe('page')
    const [salma, youssef] = await rows('Day view')
    expect(cells(salma!)).toEqual(['Salma Ibrahim', expect.stringMatching(/^\d+:40 [AP]MLate$/), expect.stringMatching(/^\d+:05 [AP]M$/), '7.4h', '6h'])
    expect(cells(youssef!)).toEqual(['Youssef Abdelrahman', '—', '—', '—', '—'])
    expect(api.attendance.day).toHaveBeenCalledWith('2026-10-26', undefined)
    expect((screen.getByLabelText('Day') as HTMLInputElement).value).toBe('2026-10-26')
  })

  it('on an earlier day, a check-in never closed reads "Not checked out", with no hours', async () => {
    vi.mocked(api.attendance.day).mockResolvedValue([{ ...dayRows[0]!, checkedOutAt: null, hours: 0, late: false }])
    await mount('?tab=day&day=2026-10-26')
    expect(cells((await rows('Day view'))[0]!).slice(2, 4)).toEqual(['Not checked out', '—'])
  })

  it('activity log and report', async () => {
    await mount('?tab=activity')
    expect(cells((await rows('Activity log'))[0]!)).toEqual(['Salma Ibrahim', '26 Oct 2026', expect.stringMatching(/^\d+:40 [AP]M–\d+:00 [AP]M$/), '1h 15m', '41.233.18.9', 'Chrome 130 · Windows'])
    fireEvent.click(screen.getByRole('link', { name: 'Report' }))
    expect(cells((await rows('Report'))[0]!)).toEqual(['Salma Ibrahim', '5', '9:12 AM', '6:05 PM', '1', '0', '40.4h', '32h 20m'])
  })

  it('working hours: said above the tabs; changed only with "Change settings, users and roles"; a refusal shows in the sheet', async () => {
    const set = vi.spyOn(api.attendance, 'setWorkHours').mockRejectedValueOnce(new ApiError({ title: 'Bad request', status: 400, detail: 'The day ends after it starts.' })).mockResolvedValue({ days: [0, 1, 2, 3], start: '08:30', end: '16:30', timeZone: 'Africa/Cairo' })
    await mount()
    expect(await screen.findByText('Sun–Thu · 9:00 AM–5:00 PM · Cairo time')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Change working hours' }))
    const sheet = await screen.findByRole('dialog', { name: 'Working hours' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Thursday' }))
    expect(within(sheet).getByRole('button', { name: 'Thursday' }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.change(within(sheet).getByLabelText('Starts'), { target: { value: '08:30' } })
    fireEvent.change(within(sheet).getByLabelText('Ends'), { target: { value: '16:30' } })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    expect(await within(sheet).findByText('The day ends after it starts.')).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(set).toHaveBeenLastCalledWith({ days: [0, 1, 2, 3], start: '08:30', end: '16:30' })
  })

  it('someone who sees only themselves gets no person filter and no Change', async () => {
    me = { ...me, id: 'u-5', roleIds: ['member'], grants: [] }
    vi.mocked(api.attendance.scope).mockResolvedValue({ userIds: ['u-5'] })
    await mount()
    await table('Check-ins')
    expect(screen.queryByRole('combobox', { name: 'Person' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Change working hours' })).toBeNull()
    expect(screen.getByText(/Only your own/)).toBeTruthy()
  })
})
