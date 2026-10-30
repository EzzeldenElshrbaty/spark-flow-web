// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SavedView as Saved } from '@/api/types'
import { SavedView } from '@/pages/chat/saved/SavedView'

afterEach(cleanup)
window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const now = new Date()
const hours = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString()
let n = 0
const item = (over: Partial<Saved> = {}): Saved => ({
  id: `s${++n}`, userId: 'u-1', workspaceId: 'ws-eng', target: { kind: 'message', id: `m${n}` }, status: 'inProgress', remindAt: null, firedAt: null,
  savedAt: hours(-5), channelId: 'c-backend', rootId: null, authorId: 'u-2', authorName: 'Nour El-Sayed', text: 'Rotate the refresh tokens', createdAt: hours(-6), gone: null, ...over,
})
const soon = item({ id: 'soon', remindAt: hours(2), text: 'Review the release notes' })
const later = item({ id: 'later', remindAt: hours(48), text: 'Plan the sprint' })
const plain = item({ id: 'plain' })
const archived = item({ id: 'archived', status: 'archived', text: 'Old idea' })
const done = item({ id: 'done', status: 'completed', text: 'Shipped it' })

type Props = Partial<ComponentProps<typeof SavedView>>
function show(props: Props = {}) {
  const handlers = { onUpdate: vi.fn(), onRemove: vi.fn(), onRetry: vi.fn() }
  render(
    <MemoryRouter>
      <SavedView items={[soon, later, plain, archived, done]} ws="engineering" placeOf={() => '#backend'} error={false} retrying={false} {...handlers} {...props} />
    </MemoryRouter>,
  )
  return handlers
}
const rows = () => within(screen.getByRole('tabpanel')).queryAllByRole('article')

describe('Saved (spec 6.12)', () => {
  it('has its title and the tabs In progress (with its count), Archived and Completed', () => {
    show()
    expect(screen.getByRole('heading', { level: 1, name: 'Saved' })).toBeTruthy()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['In progress 3', 'Archived', 'Completed'])
    expect(rows().map((r) => r.getAttribute('aria-label'))).toEqual(['Nour El-Sayed in #backend', 'Nour El-Sayed in #backend', 'Nour El-Sayed in #backend'])
  })

  it('each row: source line, text, and the reminder time, in accent when due within 24 hours', () => {
    show()
    const [first, second, third] = rows()
    expect(first.textContent).toContain('Nour El-Sayed in #backend')
    expect(first.textContent).toContain('Review the release notes')
    const due = within(first).getByText(/^Reminder /)
    expect(due.className).toContain('text-sf-accent')
    expect(within(second).getByText(/^Reminder /).className).not.toContain('text-sf-accent')
    expect(within(third).queryByText(/^Reminder /)).toBeNull()
  })

  it('opens the message, or a reply in its thread', () => {
    show({ items: [plain, item({ id: 'reply', target: { kind: 'reply', id: 'r9' }, rootId: 'm-root' })] })
    const links = within(screen.getByRole('tabpanel')).getAllByRole('link', { name: /View message/ })
    expect(links[0].getAttribute('href')).toBe(`/w/engineering/c/c-backend?message=${'id' in plain.target ? plain.target.id : ''}`)
    expect(links[1].getAttribute('href')).toBe('/w/engineering/c/c-backend?thread=m-root')
  })

  it('the checkbox completes it; in Completed it brings it back', async () => {
    const { onUpdate } = show()
    await act(async () => fireEvent.click(within(rows()[0]).getByRole('checkbox', { name: 'Mark complete' })))
    expect(onUpdate).toHaveBeenCalledWith('soon', { status: 'completed' })
    await act(async () => fireEvent.click(screen.getByRole('tab', { name: 'Completed' })))
    const box = within(rows()[0]).getByRole('checkbox', { name: 'Mark not complete' }) as HTMLInputElement
    expect(box.checked).toBe(true)
    await act(async () => fireEvent.click(box))
    expect(onUpdate).toHaveBeenLastCalledWith('done', { status: 'inProgress' })
  })

  it('Archive puts it away; in Archived, Move to In progress brings it back', async () => {
    const { onUpdate } = show()
    await act(async () => fireEvent.click(within(rows()[2]).getByRole('button', { name: 'Archive' })))
    expect(onUpdate).toHaveBeenCalledWith('plain', { status: 'archived' })
    await act(async () => fireEvent.click(screen.getByRole('tab', { name: 'Archived' })))
    await act(async () => fireEvent.click(within(rows()[0]).getByRole('button', { name: 'Move to In progress' })))
    expect(onUpdate).toHaveBeenLastCalledWith('archived', { status: 'inProgress' })
  })

  it('change reminder: a preset sets the time, Remove reminder clears it', async () => {
    const { onUpdate } = show()
    await act(async () => fireEvent.click(within(rows()[0]).getByRole('button', { name: 'Change reminder' })))
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: /In 1 hour/ })))
    const at = onUpdate.mock.calls[0][1].remindAt as string
    expect(Math.abs(new Date(at).getTime() - (Date.now() + 3_600_000))).toBeLessThan(5_000)
    await act(async () => fireEvent.click(within(rows()[0]).getByRole('button', { name: 'Change reminder' })))
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Remove reminder' })))
    expect(onUpdate).toHaveBeenLastCalledWith('soon', { remindAt: null })
    await act(async () => fireEvent.click(within(rows()[2]).getByRole('button', { name: 'Set reminder' })))
    expect(screen.queryByRole('menuitem', { name: 'Remove reminder' })).toBeNull()
  })

  it('Custom… asks for a date and time in the future', async () => {
    const { onUpdate } = show()
    await act(async () => fireEvent.click(within(rows()[2]).getByRole('button', { name: 'Set reminder' })))
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Custom…' })))
    const dialog = screen.getByRole('dialog', { name: 'Remind me' })
    const input = within(dialog).getByLabelText('Date and time')
    fireEvent.change(input, { target: { value: '2000-01-01T09:00' } })
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Set reminder' })))
    expect(within(dialog).getByRole('alert').textContent).toBe('Pick a time in the future.')
    expect(onUpdate).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '2099-06-01T09:30' } })
    await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: 'Set reminder' })))
    expect(onUpdate).toHaveBeenCalledWith('plain', { remindAt: new Date(2099, 5, 1, 9, 30).toISOString() })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('More: Remove from Saved', async () => {
    const { onRemove } = show()
    await act(async () => fireEvent.click(within(rows()[0]).getByRole('button', { name: 'More actions' })))
    await act(async () => fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from Saved' })))
    expect(onRemove).toHaveBeenCalledWith('soon')
  })

  it('a deleted or hidden message says so, with no link', () => {
    show({ items: [item({ id: 'x', gone: 'deleted', text: '', authorName: null }), item({ id: 'y', gone: 'hidden', text: '', authorName: null })] })
    const [deleted, hidden] = rows()
    expect(deleted.textContent).toContain('This message was deleted.')
    expect(hidden.textContent).toContain('You can no longer see this message.')
    expect(within(deleted).queryByRole('link')).toBeNull()
  })

  it('empty tabs say so; loading shows pulse rows; a failure offers Try again', async () => {
    show({ items: [] })
    expect(screen.getByRole('tabpanel').textContent).toContain('Nothing saved yet. Save a message with S or its ⋯ menu.')
    cleanup()
    show({ items: undefined })
    expect(screen.getByRole('tabpanel').getAttribute('aria-busy')).toBe('true')
    cleanup()
    const { onRetry } = show({ items: undefined, error: true })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try again' })))
    expect(onRetry).toHaveBeenCalled()
  })
})

describe('Saved: a /remind note (spec 6.8)', () => {
  it('says where it was set, shows my words, and opens that channel', () => {
    const note = item({ id: 'note', target: { kind: 'note', text: 'check the deploy', channelId: 'c-backend' }, authorId: 'u-1', authorName: 'Youssef Abdelrahman', text: 'check the deploy', remindAt: hours(1) })
    show({ items: [note] })
    const [row] = rows()
    expect(row.getAttribute('aria-label')).toBe('Reminder set in #backend')
    expect(row.textContent).toContain('check the deploy')
    expect(within(row).getByRole('link', { name: 'Open #backend: check the deploy' }).getAttribute('href')).toBe('/w/engineering/c/c-backend')
  })
})

describe('Saved: a file (spec 6.9)', () => {
  it('says it is a file, shows its title, and opens the message it was shared in', () => {
    const file = item({ id: 'f', target: { kind: 'file', id: 'a1' }, text: 'scope.pdf', messageId: 'm7', file: { id: 'a1', name: 'scope.pdf', title: 'scope.pdf' } as never })
    show({ items: [file] })
    const [row] = rows()
    expect(row.getAttribute('aria-label')).toBe('File from Nour El-Sayed in #backend')
    expect(within(row).getByRole('link', { name: 'View file: scope.pdf' }).getAttribute('href')).toBe('/w/engineering/c/c-backend?message=m7')
  })
})
