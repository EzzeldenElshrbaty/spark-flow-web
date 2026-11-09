// @vitest-environment jsdom
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuditEvent, AuditFilter, AuditPage, AuditSummary, Me } from '@/api/types'
import { api, ApiError } from '@/lib/api'
import { chainEvent, GENESIS, type UnchainedEvent } from '@/lib/auditChain'
import { ALL_PERMISSIONS } from '@/lib/permissions'
import { AuditLogPage } from './AuditLogPage'

window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const base = (seq: number, over: Partial<UnchainedEvent>): UnchainedEvent => ({
  seq, at: new Date(Date.now() - (10 - seq) * 60_000).toISOString(), actorId: 'u-1', actorName: 'Youssef Abdelrahman', actorRoles: 'Admin', action: 'signedIn', group: 'access',
  record: null, changes: [], result: 'done', detail: null, ip: '156.199.4.21', device: 'Chrome 130 · macOS', requestId: `req-${seq}`, ...over,
})
function chain(): AuditEvent[] {
  const out: AuditEvent[] = []
  for (const e of [
    base(1, { record: { type: 'user', id: 'u-1', name: 'Youssef Abdelrahman' }, detail: 'Password' }),
    base(2, { action: 'changed', group: 'data', record: { type: 'project', id: 'p-nex', name: 'Nexus Core' }, changes: [{ field: 'Due date', from: '28 Nov 2026', to: '5 Dec 2026' }, { field: 'Manager', from: 'Nour El-Sayed', to: 'Ahmed Shawky' }] }),
    base(3, { action: 'denied', actorId: 'u-3', actorName: 'Mariam Fathy', actorRoles: 'Member', record: { type: 'request', id: 'rates.list', name: 'rates.list' }, result: 'refused', detail: "You don't have access to hourly costs." }),
  ])
    out.push(chainEvent(e, out.at(-1)?.hash ?? GENESIS))
  return out
}

let events: AuditEvent[]
let summary: AuditSummary
let me: Me
let nextCursor: string | null
beforeEach(() => {
  events = chain()
  nextCursor = null
  summary = {
    today: { events: 3, data: 1, signIns: 1, failedSignIns: 0, denied: 1 },
    needsALook: [{ tone: 'amber', text: 'Youssef Abdelrahman changed roles and permissions: Sales: Create projects Off → On', at: events[1]!.at, seq: 2 }],
    chain: { intact: true, checked: 3 },
    people: [{ id: 'u-3', name: 'Mariam Fathy' }, { id: 'u-1', name: 'Youssef Abdelrahman' }],
    recordTypes: [{ id: 'user', label: 'People' }, { id: 'project', label: 'Projects' }, { id: 'request', label: 'Requests' }],
  }
  me = { id: 'u-1', name: 'Youssef Abdelrahman', email: 'y@spark-sys.com', title: 'Managing Director', roleIds: ['admin'], presence: 'active', teamIds: [], grants: [...ALL_PERMISSIONS] }
  vi.spyOn(api.users, 'me').mockImplementation(async () => me)
  vi.spyOn(api.audit, 'list').mockImplementation(async (filter: AuditFilter): Promise<AuditPage> => {
    const items = events.filter((e) => (!filter.group || e.group === filter.group) && (!filter.q || e.actorName.includes(filter.q))).reverse()
    return { items, nextCursor, counts: { all: events.length, data: 1, status: 0, access: 2, settings: 0, exports: 0 } }
  })
  vi.spyOn(api.audit, 'summary').mockImplementation(async () => summary)
  vi.spyOn(api.audit, 'get').mockImplementation(async (seq) => {
    if (seq === 9) return { ...events[0]!, seq: 9, detail: 'From a link' }
    throw new ApiError({ title: 'Not found', status: 404 })
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

let location = ''
function Where() {
  const l = useLocation()
  location = l.search
  return null
}

async function mount(search = '') {
  const client: QueryClient = new QueryClient({ mutationCache: new MutationCache({ onSuccess: () => client.invalidateQueries() }) })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/w/engineering/settings/audit${search}`]}>
        <Routes>
          <Route
            path="/w/:ws/settings/audit"
            element={
              <>
                <AuditLogPage />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await screen.findByRole('heading', { name: 'Audit log', level: 1 })
}
const table = () => screen.findByRole('table', { name: 'Audit log' })
const lastFilter = () => vi.mocked(api.audit.list).mock.calls.at(-1)![0]

describe('Audit log (Admin and help, slice 2)', () => {
  it('shows today’s counts, the tamper check and what needs a look, then the log newest first', async () => {
    await mount()
    const today = screen.getByRole('list', { name: 'Today' })
    await within(today).findByText('Intact')
    expect(within(today).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Events today3', 'Data changes1', 'Sign-ins1', 'Failed sign-ins0', 'Access denied1', 'Tamper checkIntact3 entries checked',
    ])
    const look = screen.getByRole('region', { name: 'Needs a look' })
    expect(within(look).getByRole('button').textContent).toMatch(/^Worth a look: Youssef Abdelrahman changed roles and permissions: Sales: Create projects Off → On\d+ min ago$/)
    const rows = within(await table()).getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getAllByRole('cell')[0]!.textContent)).toEqual(['#3', '#2', '#1'])
    expect(within(rows[1]!).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      '#2', expect.stringMatching(/^Today /), 'YAYoussef AbdelrahmanAdmin', 'Changed', 'Nexus CoreProjects', 'Due date: 28 Nov 2026 → 5 Dec 2026 · 1 more', '156.199.4.21',
    ])
    // A result other than Done shows under the action.
    expect(within(rows[0]!).getAllByRole('cell')[3]!.textContent).toBe('Access deniedRefused')
    // The phone list carries the same entries.
    expect(within(screen.getByRole('list', { name: 'Audit log' })).getAllByRole('listitem')).toHaveLength(3)
  })

  it('a row opens the entry: who, the record, each field before and after, where from, and its place in the chain', async () => {
    await mount()
    fireEvent.click(within(await table()).getAllByRole('row')[2]!)
    const sheet = await screen.findByRole('dialog', { name: '#2 · Changed' })
    expect(location).toBe('?entry=2')
    expect(within(sheet).getByText('Nexus Core')).toBeTruthy()
    expect(within(sheet).getByText('Projects ·', { exact: false }).textContent).toBe('Projects · p-nex')
    const changes = within(sheet).getByRole('table', { name: 'Changes' })
    expect(within(changes).getAllByRole('row').map((r) => r.textContent)).toEqual(['FieldBeforeAfter', 'Due date28 Nov 20265 Dec 2026', 'ManagerNour El-SayedAhmed Shawky'])
    expect(within(sheet).getByText(events[1]!.hash)).toBeTruthy()
    expect(within(sheet).getByText(events[0]!.hash)).toBeTruthy()
    expect(within(sheet).getByText('Chrome 130 · macOS')).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(location).toBe('')
  })

  it('the kinds and filters go in the address and to the server; the search waits for a pause', async () => {
    await mount()
    await table()
    const kinds = screen.getByRole('group', { name: 'Kind of entry' })
    expect(within(kinds).getAllByRole('button').map((b) => b.textContent)).toEqual(['All3', 'Data changes1', 'Status and archive0', 'Sign-in and access2', 'Settings and users0', 'Exports and downloads0'])
    fireEvent.click(within(kinds).getByRole('button', { name: /Sign-in and access/ }))
    await waitFor(() => expect(lastFilter()).toMatchObject({ group: 'access' }))
    expect(within(kinds).getByRole('button', { name: /Sign-in and access/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.change(screen.getByRole('combobox', { name: 'Person' }), { target: { value: 'u-3' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Period' }), { target: { value: '7d' } })
    await waitFor(() => expect(lastFilter()).toMatchObject({ group: 'access', actorId: 'u-3', since: expect.any(String) }))
    const calls = vi.mocked(api.audit.list).mock.calls.length
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search the log' }), { target: { value: 'Mariam' } })
    expect(vi.mocked(api.audit.list).mock.calls.length).toBe(calls)
    await waitFor(() => expect(lastFilter()).toMatchObject({ q: 'Mariam' }))
    expect(location).toContain('q=Mariam')
    expect(location).toContain('person=u-3')
  })

  it('nothing matching says so, with the way back to everything', async () => {
    await mount('?q=nobody')
    fireEvent.click(await screen.findByRole('button', { name: /Clear search and filters/ }))
    await within(await table()).findByText('#3')
    expect(location).toBe('')
  })

  it('a broken chain says where; its line opens that entry with what is wrong', async () => {
    summary = { ...summary, chain: { intact: false, checked: 3, brokenAt: 2, reason: 'edited' } }
    await mount()
    const today = screen.getByRole('list', { name: 'Today' })
    await within(today).findByText('Broken')
    fireEvent.click(within(today).getByRole('button', { name: 'At #2: changed' }))
    const sheet = await screen.findByRole('dialog', { name: '#2 · Changed' })
    expect(within(sheet).getByRole('alert').textContent).toBe('This entry doesn’t match its hash: it was changed after it was written.')
  })

  it('an entry from a link that isn’t on screen is fetched by its number; one that doesn’t exist says so', async () => {
    await mount('?entry=9')
    const sheet = await screen.findByRole('dialog', { name: '#9 · Signed in' })
    expect(within(sheet).getByText('From a link')).toBeTruthy()
    expect(api.audit.get).toHaveBeenCalledWith(9)
    cleanup()
    await mount('?entry=99')
    expect((await screen.findByRole('alert')).textContent).toBe("There's no entry #99.")
  })

  it('Show more asks for the entries before the last one shown', async () => {
    nextCursor = '1'
    await mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Show more' }))
    await waitFor(() => expect(vi.mocked(api.audit.list).mock.calls.some((c) => c[1] === '1')).toBe(true))
  })

  it('Export CSV saves the filtered log', async () => {
    const exported = vi.spyOn(api.audit, 'export').mockResolvedValue('﻿#,When\r\n')
    let saved: Blob | undefined
    URL.createObjectURL = vi.fn((b: Blob) => ((saved = b), 'blob:x'))
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await mount('?group=access')
    await table()
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(exported.mock.calls[0]![0]).toMatchObject({ group: 'access' })
    expect(saved?.type).toBe('text/csv;charset=utf-8')
  })

  it('without "See the audit log" it says so and asks for nothing, not even a linked entry', async () => {
    me = { ...me, roleIds: ['member'], grants: ['checkins.managed'] }
    await mount('?entry=2')
    expect(await screen.findByText(/You don’t have access to the audit log\./)).toBeTruthy()
    expect(api.audit.list).not.toHaveBeenCalled()
    expect(api.audit.summary).not.toHaveBeenCalled()
    expect(api.audit.get).not.toHaveBeenCalled()
  })
})
