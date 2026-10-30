// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Draft, ScheduledMessage, SentItem } from '@/api/types'
import { parseBody } from '@/lib/messageBody'
import { DraftsView, sendsWhen } from '@/pages/chat/outbox/DraftsView'

afterEach(cleanup)
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const now = new Date()
const at = (days: number, h: number, m = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, h, m).toISOString()
const draft = (over: Partial<Draft> = {}): Draft => ({ channelId: 'c-backend', rootId: null, body: parseBody('Half-written idea'), updatedAt: new Date(Date.now() - 3_600_000).toISOString(), ...over })
const scheduled = (over: Partial<ScheduledMessage> = {}): ScheduledMessage => ({
  id: 'sch-1', userId: 'u-1', workspaceId: 'ws-eng', channelId: 'c-backend', rootId: null, content: 'Standup notes are in the doc.', body: parseBody('Standup notes are in the doc.'),
  sendAt: at(1, 9), tz: 'Africa/Cairo', status: 'scheduled', sentId: null, failure: null, ...over,
})
const sent = (over: Partial<SentItem> = {}): SentItem => ({ target: { kind: 'message', id: 'm-1' }, channelId: 'c-backend', rootId: null, text: 'Shipped the fix', createdAt: new Date(Date.now() - 7_200_000).toISOString(), ...over })

type Props = Partial<ComponentProps<typeof DraftsView>>
function show(props: Props = {}) {
  const handlers = { onDeleteDraft: vi.fn(), onSendNow: vi.fn(), onReschedule: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onRetry: vi.fn() }
  render(
    <MemoryRouter>
      <DraftsView
        drafts={[draft(), draft({ channelId: 'c-general', rootId: 'm-root', body: parseBody('A reply in progress') })]}
        scheduled={[scheduled(), scheduled({ id: 'sch-2', status: 'failed', failure: 'This channel is archived.', sendAt: at(-1, 9) })]}
        sent={[sent(), sent({ target: { kind: 'reply', id: 'r-1' }, rootId: 'm-root', text: 'Replied' })]}
        ws="engineering"
        placeOf={(id) => (id === 'c-general' ? '#general' : '#backend')}
        zone="Africa/Cairo"
        error={false}
        retrying={false}
        {...handlers}
        {...props}
      />
    </MemoryRouter>,
  )
  return handlers
}
const rows = () => within(screen.getByRole('tabpanel')).queryAllByRole('article')
const open = (name: string) => act(async () => fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${name}`) })))

describe('sendsWhen', () => {
  it('"Sends today at 2:00 PM", "Sends tomorrow at 9:00 AM", or the date', () => {
    expect(sendsWhen(at(0, 14), now)).toBe('Sends today at 2:00 PM')
    expect(sendsWhen(at(1, 9), now)).toBe('Sends tomorrow at 9:00 AM')
    expect(sendsWhen(at(10, 9), now)).toMatch(/^Sends \w{3} \d{1,2} \w{3} at 9:00 AM$/)
  })
})

describe('Drafts & sent (spec 6.12)', () => {
  it('has its title and the tabs Drafts and Scheduled with counts, and Sent', () => {
    show()
    expect(screen.getByRole('heading', { level: 1, name: 'Drafts & sent' })).toBeTruthy()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Drafts 2', 'Scheduled 2', 'Sent'])
  })

  it('Drafts: where it is, the text, and it opens there; Delete draft', async () => {
    const { onDeleteDraft } = show()
    const [first, second] = rows()
    expect(first.getAttribute('aria-label')).toBe('Draft in #backend')
    expect(second.getAttribute('aria-label')).toBe('Draft in a thread in #general')
    expect(within(first).getByRole('link').getAttribute('href')).toBe('/w/engineering/c/c-backend')
    expect(within(second).getByRole('link').getAttribute('href')).toBe('/w/engineering/c/c-general?thread=m-root')
    expect(first.textContent).toContain('Half-written idea')
    await act(async () => fireEvent.click(within(first).getByRole('button', { name: 'Delete draft' })))
    expect(onDeleteDraft).toHaveBeenCalledWith(expect.objectContaining({ channelId: 'c-backend', rootId: null }))
  })

  it('Scheduled: when it sends, the text, Send now, Reschedule, Edit, Delete; and the time zone note', async () => {
    const handlers = show()
    await open('Scheduled')
    expect(screen.getByRole('tabpanel').textContent).toContain('Times are in Africa/Cairo.')
    const [first, failed] = rows()
    expect(first.textContent).toContain('Sends tomorrow at 9:00 AM')
    expect(first.textContent).toContain('Standup notes are in the doc.')
    await act(async () => fireEvent.click(within(first).getByRole('button', { name: 'Send now' })))
    expect(handlers.onSendNow).toHaveBeenCalledWith('sch-1')
    await act(async () => fireEvent.click(within(first).getByRole('button', { name: 'Edit' })))
    expect(handlers.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'sch-1' }))
    await act(async () => fireEvent.click(within(first).getByRole('button', { name: 'Delete' })))
    expect(handlers.onDelete).toHaveBeenCalledWith('sch-1')
    await act(async () => fireEvent.click(within(first).getByRole('button', { name: 'Reschedule' })))
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Monday at 9:00 AM' })))
    expect(handlers.onReschedule).toHaveBeenCalledWith('sch-1', expect.any(Date))
    expect(failed.textContent).toContain('Not sent. This channel is archived.')
  })

  it('Sent: where it went and the text, opening the message or the reply’s thread', async () => {
    show()
    await open('Sent')
    const [message, reply] = rows()
    expect(within(message).getByRole('link').getAttribute('href')).toBe('/w/engineering/c/c-backend?message=m-1')
    expect(within(reply).getByRole('link').getAttribute('href')).toBe('/w/engineering/c/c-backend?thread=m-root')
    expect(message.textContent).toContain('Shipped the fix')
  })

  it('empty tabs say so', async () => {
    show({ drafts: [], scheduled: [], sent: [] })
    expect(screen.getByRole('tabpanel').textContent).toContain('No drafts. What you start writing and don’t send is kept here.')
    await open('Scheduled')
    expect(screen.getByRole('tabpanel').textContent).toContain('Nothing scheduled. Use the arrow next to Send to pick a time.')
    await open('Sent')
    expect(screen.getByRole('tabpanel').textContent).toContain('Nothing sent yet.')
  })

  it('loads with pulse rows, and a failure offers Try again', async () => {
    const { onRetry } = show({ drafts: undefined, error: true })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try again' })))
    expect(onRetry).toHaveBeenCalled()
    cleanup()
    show({ drafts: undefined })
    expect(screen.getByRole('tabpanel').getAttribute('aria-busy')).toBe('true')
  })
})
